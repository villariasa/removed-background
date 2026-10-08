/// <reference lib="webworker" />
//
// Off-main-thread AI matting with Transformers.js + RMBG-1.4 (plan §2 / §4.1).
// Produces a single-channel alpha matte at the image's native resolution, which
// the main thread writes straight into the shared alpha mask.

import {
  AutoModel,
  AutoProcessor,
  RawImage,
  env,
  type PreTrainedModel,
  type Processor,
} from "@huggingface/transformers";

// Remote (HF Hub) vs self-hosted weights. Build-time inlined (plan §10.5).
const REMOTE = process.env.NEXT_PUBLIC_BG_REMOTE_MODELS !== "false";
env.allowRemoteModels = REMOTE;
env.allowLocalModels = !REMOTE;
if (!REMOTE) env.localModelPath = "/models/";

// Force single-threaded WASM. Threaded WASM needs SharedArrayBuffer, which
// only exists when the page is cross-origin isolated (COOP+COEP) — and when
// it IS available, onnxruntime-web auto-opts into a pthread-worker codepath
// that throws "Connection closed" under a strict CSP (it needs 'unsafe-eval'
// to bootstrap, which we don't grant). Pinning numThreads avoids that whole
// failure class and removes the need for COOP/COEP entirely. WebGPU is
// unaffected — this only touches the WASM/CPU fallback.
try {
  // Non-null assertion: TS types this as possibly undefined since it's
  // populated by the onnx backend module, but it's present synchronously in
  // the browser bundle. The try/catch is the real runtime safety net.
  env.backends.onnx.wasm!.numThreads = 1;
  env.backends.onnx.wasm!.proxy = false;
} catch (err) {
  console.warn("Could not pin onnxruntime-web to single-threaded WASM:", err);
}

const MODEL_ID = "briaai/RMBG-1.4";
// Run inference at a capped working resolution for speed; the matte is upscaled
// to native res before it leaves the worker (plan §7).
const WORKING_MAX = 1024;

let model: PreTrainedModel | null = null;
let processor: Processor | null = null;
let device: "webgpu" | "wasm" = "wasm";

type In =
  | { id: number; type: "init" }
  | { id: number; type: "matte"; data: ArrayBuffer; width: number; height: number };

type Out =
  | { id: number; type: "progress"; progress: number; label: string }
  | { id: number; type: "ready"; device: string }
  | { id: number; type: "matte"; mask: ArrayBuffer; width: number; height: number }
  | { id: number; type: "error"; message: string };

function post(msg: Out, transfer?: Transferable[]) {
  (self as DedicatedWorkerGlobalScope).postMessage(msg, transfer ?? []);
}

// Short, human filenames instead of the full HF repo-relative path.
function shortName(file?: string): string {
  if (!file) return "model file";
  const base = file.split("/").pop() || file;
  return base;
}

/**
 * Transformers.js reports per-file download progress (multiple files: the
 * ONNX weights, config.json, preprocessor config, …). Track each file's
 * loaded/total so we can report one smooth, weighted overall percentage
 * instead of the progress resetting to 0% every time a new file starts.
 */
function makeProgressTracker(id: number) {
  const files = new Map<string, { loaded: number; total: number; done: boolean }>();

  function emit(label: string) {
    let loaded = 0;
    let total = 0;
    for (const f of files.values()) {
      loaded += f.done ? f.total : f.loaded;
      total += f.total;
    }
    const progress = total > 0 ? Math.min(0.97, loaded / total) : 0;
    post({ id, type: "progress", progress, label });
  }

  return (p: {
    status?: string;
    file?: string;
    progress?: number;
    loaded?: number;
    total?: number;
  }) => {
    const key = p.file ?? "model";
    switch (p.status) {
      case "initiate":
        files.set(key, { loaded: 0, total: p.total ?? 0, done: false });
        emit(`Downloading ${shortName(p.file)}…`);
        break;
      case "progress": {
        const f = files.get(key) ?? { loaded: 0, total: p.total ?? 0, done: false };
        f.loaded = p.loaded ?? f.loaded;
        if (p.total) f.total = p.total;
        files.set(key, f);
        const pct =
          typeof p.progress === "number"
            ? Math.round(p.progress)
            : f.total
              ? Math.round((f.loaded / f.total) * 100)
              : undefined;
        emit(
          pct != null
            ? `Downloading ${shortName(p.file)}… ${pct}%`
            : `Downloading ${shortName(p.file)}…`,
        );
        break;
      }
      case "done": {
        const f = files.get(key) ?? { loaded: 0, total: 0, done: false };
        f.done = true;
        files.set(key, f);
        emit(
          files.size && [...files.values()].every((v) => v.done)
            ? "Loading model…"
            : `Downloading ${shortName(p.file)}…`,
        );
        break;
      }
      // "ready" and other statuses carry no useful progress — ignored.
    }
  };
}

async function ensureModel(id: number) {
  if (model && processor) return;

  // Prefer WebGPU; fall back to WASM (plan §7).
  const hasWebGPU = typeof (self.navigator as Navigator & { gpu?: unknown }).gpu !== "undefined";
  device = hasWebGPU ? "webgpu" : "wasm";

  const progress_callback = makeProgressTracker(id);

  try {
    model = await AutoModel.from_pretrained(MODEL_ID, {
      // fp16 on WebGPU; the 8-bit quantized ONNX export on WASM/CPU — both
      // smaller to download and several times faster than fp32 on CPU.
      device,
      dtype: device === "webgpu" ? "fp16" : "q8",
      progress_callback,
    });
  } catch (err) {
    // WebGPU init can fail on some drivers — retry on WASM.
    if (device === "webgpu") {
      device = "wasm";
      post({ id, type: "progress", progress: 0, label: "Falling back to CPU (WASM)…" });
      model = await AutoModel.from_pretrained(MODEL_ID, {
        device: "wasm",
        dtype: "q8",
        progress_callback,
      });
    } else {
      throw err;
    }
  }
  post({
    id,
    type: "progress",
    progress: 0.98,
    label: `Loading processor (${device === "webgpu" ? "GPU" : "CPU"})…`,
  });
  processor = await AutoProcessor.from_pretrained(MODEL_ID);
}

async function runMatte(data: ArrayBuffer, width: number, height: number): Promise<RawImage> {
  const rgba = new Uint8ClampedArray(data);
  let image = new RawImage(rgba, width, height, 4);

  // downscale to working resolution for inference
  const longest = Math.max(width, height);
  if (longest > WORKING_MAX) {
    const scale = WORKING_MAX / longest;
    image = await image.resize(Math.round(width * scale), Math.round(height * scale));
  }

  const { pixel_values } = await processor!(image);
  const { output } = await model!({ input: pixel_values });

  // output[0]: [1, H, W] in 0..1 → scale to 0..255 uint8, upscale to native res
  const matte = await RawImage.fromTensor(output[0].mul(255).to("uint8")).resize(
    width,
    height,
  );
  return matte;
}

self.onmessage = async (e: MessageEvent<In>) => {
  const msg = e.data;
  try {
    if (msg.type === "init") {
      post({ id: msg.id, type: "progress", progress: 0, label: "Preparing model…" });
      await ensureModel(msg.id);
      post({ id: msg.id, type: "ready", device });
      return;
    }

    if (msg.type === "matte") {
      post({ id: msg.id, type: "progress", progress: 0, label: "Preparing model…" });
      await ensureModel(msg.id);
      post({
        id: msg.id,
        type: "progress",
        progress: 0.6,
        label: `Removing background (${device === "webgpu" ? "GPU" : "CPU"})…`,
      });

      const matte = await runMatte(msg.data, msg.width, msg.height);
      post({ id: msg.id, type: "progress", progress: 0.95, label: "Finalizing mask…" });
      // matte.data may be Uint8Array/Uint8ClampedArray, 1 channel.
      const buf = matte.data.buffer.slice(0) as ArrayBuffer;
      post(
        { id: msg.id, type: "matte", mask: buf, width: msg.width, height: msg.height },
        [buf],
      );
    }
  } catch (err) {
    post({
      id: msg.id,
      type: "error",
      message: err instanceof Error ? err.message : String(err),
    });
  }
};
