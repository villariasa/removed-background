"use client";

// Thin RPC wrapper over the ML worker. Keeps a single worker instance alive so
// model weights (cached in IndexedDB by the runtime) and the loaded session are
// reused across calls.

import type { Mask } from "../mask";

type ProgressCb = (progress: number, label: string) => void;

interface Pending {
  resolve: (v: unknown) => void;
  reject: (e: Error) => void;
  onProgress?: ProgressCb;
}

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, Pending>();

function getWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL("./ml.worker.ts", import.meta.url), { type: "module" });
  worker.onmessage = (e: MessageEvent) => {
    const msg = e.data as {
      id: number;
      type: string;
      progress?: number;
      label?: string;
      message?: string;
      mask?: ArrayBuffer;
      device?: string;
    };
    const p = pending.get(msg.id);
    if (!p) return;
    if (msg.type === "progress") {
      p.onProgress?.(msg.progress ?? 0, msg.label ?? "");
    } else if (msg.type === "error") {
      pending.delete(msg.id);
      p.reject(new Error(msg.message || "Worker error"));
    } else {
      pending.delete(msg.id);
      p.resolve(msg);
    }
  };
  worker.onerror = (e) => {
    const err = new Error(e.message || "Worker crashed");
    for (const [, p] of pending) p.reject(err);
    pending.clear();
  };
  return worker;
}

function call<T>(
  message: Record<string, unknown>,
  transfer: Transferable[],
  onProgress?: ProgressCb,
): Promise<T> {
  const w = getWorker();
  const id = nextId++;
  return new Promise<T>((resolve, reject) => {
    pending.set(id, { resolve: resolve as (v: unknown) => void, reject, onProgress });
    w.postMessage({ ...message, id }, transfer);
  });
}

/** Warm up the model (download + session init). */
export function initModel(onProgress?: ProgressCb): Promise<{ device: string }> {
  return call<{ device: string }>({ type: "init" }, [], onProgress);
}

/** Run the AI matte on an image; returns a native-res single-channel alpha mask. */
export async function autoMatte(
  imageData: ImageData,
  onProgress?: ProgressCb,
): Promise<Mask> {
  // copy the pixel buffer so we can transfer it without detaching the caller's
  const buf = imageData.data.buffer.slice(0);
  const res = await call<{ mask: ArrayBuffer; width: number; height: number }>(
    { type: "matte", data: buf, width: imageData.width, height: imageData.height },
    [buf],
    onProgress,
  );
  return new Uint8ClampedArray(res.mask);
}
