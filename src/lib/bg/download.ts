"use client";

import { useEditor } from "./store";
import { applyRefine, contentBounds } from "./mask";
import { exportBlob, type Background } from "./compositor";
import { sanitizeFilename } from "./image";

export interface DownloadOptions {
  format: "png" | "webp";
  maxSize?: number; // 0/undefined = original
  trim?: boolean;
}

/** Export the current editor state (reads straight from the store) and trigger a download. */
export async function downloadCurrent(opts: DownloadOptions): Promise<boolean> {
  const st = useEditor.getState();
  const img = st.image;
  const base = st.baseMask;
  if (!img || !base) return false;

  const eff = applyRefine(base, img.width, img.height, st.refine);
  const blob = await exportBlob(
    {
      source: img.imageData,
      mask: eff,
      width: img.width,
      height: img.height,
      background: st.background as Background,
      spill: st.refine.spill,
    },
    {
      format: opts.format,
      maxSize: opts.maxSize ?? 0,
      trim: opts.trim ?? false,
      trimBounds: opts.trim ? contentBounds(eff, img.width, img.height) : null,
    },
  );

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${sanitizeFilename(img.name)}-cutout.${opts.format}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return true;
}
