/// <reference lib="webworker" />
//
// Off-main-thread AI matting with Transformers.js + RMBG-1.4 (plan §2 / §4.1).
// Produces a single-channel alpha matte at the image's native resolution, which
// the main thread writes straight into the shared alpha mask.

import {
  AutoModel,
  AutoModelForObjectDetection,
  AutoProcessor,
  SamModel,
  RawImage,
  env,
  type PreTrainedModel,
  type Processor,
  type Tensor,
} from "@huggingface/transformers";
import { nonMaxSuppression } from "../nms";

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

// Object detection (YOLOS) + promptable segmentation (SlimSAM) — plan §4.2,
// implemented as point-prompts (a detected box's center) rather than true
// box-prompts: the published slimsam-77-uniform ONNX decoder graph only has
// 4 real inputs (image embeddings x2, input_points, input_labels) — passing
// input_boxes gets silently ignored by onnxruntime ("too many inputs").
const DET_MODEL_ID = "Xenova/yolos-tiny";
const SAM_MODEL_ID = "Xenova/slimsam-77-uniform";

let detModel: PreTrainedModel | null = null;
let detProcessor: Processor | null = null;
let samModel: InstanceType<typeof SamModel> | null = null;
let samProcessor: Processor | null = null;

// Cached per-image SAM encoder state so repeated decode calls (one per
// selected object) don't re-run the expensive vision encoder.
let samImage: RawImage | null = null;
let samEmbeddings: Record<string, Tensor> | null = null;

export interface DetectedBox {
  label: string;
  score: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

type In =
  | { id: number; type: "init" }
  | { id: number; type: "matte"; data: ArrayBuffer; width: number; height: number }
  | { id: number; type: "detect"; data: ArrayBuffer; width: number; height: number }
  | { id: number; type: "samPrepare"; data: ArrayBuffer; width: number; height: number }
  | { id: number; type: "samSegment"; boxes: DetectedBox[]; width: number; height: number };

type Out =
  | { id: number; type: "progress"; progress: number; label: string }
  | { id: number; type: "ready"; device: string }
  | { id: number; type: "matte"; mask: ArrayBuffer; width: number; height: number }
  | { id: number; type: "detections"; boxes: DetectedBox[] }
  | { id: number; type: "samReady" }
  | { id: number; type: "segment"; mask: ArrayBuffer; width: number; height: number }
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

async function ensureDetModel(id: number) {
  if (detModel && detProcessor) return;
  const progress_callback = makeProgressTracker(id);
  detModel = await AutoModelForObjectDetection.from_pretrained(DET_MODEL_ID, {
    device: "wasm",
    dtype: "q8",
    progress_callback,
  });
  detProcessor = await AutoProcessor.from_pretrained(DET_MODEL_ID);
}

async function ensureSamModel(id: number) {
  if (samModel && samProcessor) return;
  const progress_callback = makeProgressTracker(id);
  samModel = (await SamModel.from_pretrained(SAM_MODEL_ID, {
    device: "wasm",
    dtype: "q8",
    progress_callback,
  })) as InstanceType<typeof SamModel>;
  samProcessor = await AutoProcessor.from_pretrained(SAM_MODEL_ID);
}

async function runDetect(data: ArrayBuffer, width: number, height: number): Promise<DetectedBox[]> {
  const rgba = new Uint8ClampedArray(data);
  const image = new RawImage(rgba, width, height, 4);

  const inputs = await detProcessor!(image);
  const outputs = await detModel!(inputs);
  // `image_processor` is where post_process_object_detection actually lives
  // in this package version — not directly on the wrapping Processor.
  const imageProcessor = (
    detProcessor as unknown as {
      image_processor: {
        post_process_object_detection: (
          outputs: unknown,
          threshold: number,
          targetSizes: number[][],
        ) => { boxes: number[][]; classes: number[]; scores: number[] }[];
      };
    }
  ).image_processor;
  const [result] = imageProcessor.post_process_object_detection(outputs, 0.5, [[height, width]]);

  const id2label = (detModel!.config as unknown as { id2label: Record<number, string> }).id2label;
  const boxes = result.boxes.map((box, i) => ({
    label: id2label[result.classes[i]] ?? `class ${result.classes[i]}`,
    score: result.scores[i],
    x0: Math.max(0, box[0]),
    y0: Math.max(0, box[1]),
    x1: Math.min(width, box[2]),
    y1: Math.min(height, box[3]),
  }));
  // The model/post-processor returns no deduplication of its own — several
  // overlapping boxes commonly fire on the same physical object.
  return nonMaxSuppression(boxes, 0.5);
}

async function runSamPrepare(data: ArrayBuffer, width: number, height: number) {
  const rgba = new Uint8ClampedArray(data);
  samImage = new RawImage(rgba, width, height, 4);
  const imageInputs = await samProcessor!(samImage);
  samEmbeddings = (await samModel!.get_image_embeddings(imageInputs)) as unknown as Record<
    string,
    Tensor
  >;
}

/** Decode one point-prompt per box (reusing cached encoder state) and OR all
 * resulting masks into a single native-resolution 0/255 alpha mask. */
async function runSamSegment(boxes: DetectedBox[], width: number, height: number): Promise<Uint8ClampedArray> {
  if (!samImage || !samEmbeddings) throw new Error("SAM not prepared for this image yet.");
  const combined = new Uint8ClampedArray(width * height);

  for (const box of boxes) {
    // Three foreground points instead of one: dead-center plus two points
    // offset along the box diagonal. A single center point under-segments
    // objects that are cut off by the frame edge or irregularly shaped —
    // confirmed empirically (a cat cropped in half: single-point IoU
    // candidates [0.83,0.88,0.37] covering 45% of the frame vs three-point
    // [0.95,0.95,0.90] covering 56%, correctly extending to the cut edges).
    // Verified harmless on normal, fully-visible objects (near-identical
    // mask vs single-point there).
    const cx = (box.x0 + box.x1) / 2;
    const cy = (box.y0 + box.y1) / 2;
    const qx1 = box.x0 + (box.x1 - box.x0) * 0.3;
    const qy1 = box.y0 + (box.y1 - box.y0) * 0.3;
    const qx2 = box.x0 + (box.x1 - box.x0) * 0.7;
    const qy2 = box.y0 + (box.y1 - box.y0) * 0.7;
    const promptInputs = await samProcessor!(samImage, {
      input_points: [[[cx, cy], [qx1, qy1], [qx2, qy2]]],
      input_labels: [[1, 1, 1]],
    });
    const out = await samModel!({ ...promptInputs, ...samEmbeddings });
    const iouScores = Array.from((out as unknown as { iou_scores: Tensor }).iou_scores.data as Float32Array);
    const best = iouScores.indexOf(Math.max(...iouScores));

    const masksArr = await (
      samProcessor as unknown as {
        post_process_masks: (
          pred: Tensor,
          originalSizes: unknown,
          reshapedSizes: unknown,
        ) => Promise<Tensor[]>;
      }
    ).post_process_masks(
      (out as unknown as { pred_masks: Tensor }).pred_masks,
      (promptInputs as unknown as { original_sizes: unknown }).original_sizes,
      (promptInputs as unknown as { reshaped_input_sizes: unknown }).reshaped_input_sizes,
    );
    const mask = masksArr[0]; // dims: [1, numCandidates, H, W]
    const [, , H, W] = mask.dims;
    const maskData = mask.data as Uint8Array;
    const offset = best * H * W;

    // Union (OR) into the combined mask — upscale isn't needed since
    // post_process_masks already returns native image resolution.
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (maskData[offset + y * W + x]) combined[y * width + x] = 255;
      }
    }
  }
  return combined;
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
      return;
    }

    if (msg.type === "detect") {
      post({ id: msg.id, type: "progress", progress: 0, label: "Preparing detector…" });
      await ensureDetModel(msg.id);
      post({ id: msg.id, type: "progress", progress: 0.9, label: "Detecting objects…" });
      const boxes = await runDetect(msg.data, msg.width, msg.height);
      post({ id: msg.id, type: "detections", boxes });
      return;
    }

    if (msg.type === "samPrepare") {
      post({ id: msg.id, type: "progress", progress: 0, label: "Preparing segmentation model…" });
      await ensureSamModel(msg.id);
      post({ id: msg.id, type: "progress", progress: 0.9, label: "Analyzing image…" });
      await runSamPrepare(msg.data, msg.width, msg.height);
      post({ id: msg.id, type: "samReady" });
      return;
    }

    if (msg.type === "samSegment") {
      const mask = await runSamSegment(msg.boxes, msg.width, msg.height);
      const buf = mask.buffer.slice(0) as ArrayBuffer;
      post({ id: msg.id, type: "segment", mask: buf, width: msg.width, height: msg.height }, [buf]);
      return;
    }
  } catch (err) {
    post({
      id: msg.id,
      type: "error",
      message: err instanceof Error ? err.message : String(err),
    });
  }
};
