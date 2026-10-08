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

async function ensureModel(id: number) {
  if (model && processor) return;

  // Prefer WebGPU; fall back to WASM (plan §7).
  const hasWebGPU = typeof (self.navigator as Navigator & { gpu?: unknown }).gpu !== "undefined";
  device = hasWebGPU ? "webgpu" : "wasm";

  const progress_callback = (p: { status?: string; progress?: number; file?: string }) => {
    if (p.status === "progress" && typeof p.progress === "number") {
      post({
        id,
        type: "progress",
        progress: Math.min(0.99, p.progress / 100),
        label: `Downloading model… ${Math.round(p.progress)}%`,
      });
    }
  };

  try {
    model = await AutoModel.from_pretrained(MODEL_ID, {
      // fp16 is fine on WebGPU; WASM path uses fp32.
      device,
      dtype: device === "webgpu" ? "fp16" : "fp32",
      progress_callback,
    });
  } catch (err) {
    // WebGPU init can fail on some drivers — retry on WASM.
    if (device === "webgpu") {
      device = "wasm";
      model = await AutoModel.from_pretrained(MODEL_ID, {
        device: "wasm",
        dtype: "fp32",
        progress_callback,
      });
    } else {
      throw err;
    }
  }
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
      post({ id: msg.id, type: "progress", progress: 0.6, label: "Removing background…" });

      const matte = await runMatte(msg.data, msg.width, msg.height);
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
