// Compositing: originalRGB × mask over the chosen background. Produces the live
// preview and the final export. Canvas 2D implementation (plan §6); the hot path
// can later be swapped for WebGL without changing callers.

import type { Mask } from "./mask";

export type Background =
  | { kind: "transparent" }
  | { kind: "color"; color: string }
  | { kind: "image"; bitmap: ImageBitmap }
  | { kind: "blur"; radius: number };

export interface CompositeInput {
  source: ImageData; // original RGBA at native res
  mask: Mask; // alpha, native res
  width: number;
  height: number;
  background: Background;
  spill?: number; // 0..1 edge color decontamination strength
}

/** Build the cut-out RGBA (premultiplied-correct) with the mask as alpha. */
function cutout(input: CompositeInput): ImageData {
  const { source, mask, width, height, spill = 0 } = input;
  const out = new ImageData(width, height);
  const src = source.data;
  const dst = out.data;

  for (let i = 0, p = 0; i < mask.length; i++, p += 4) {
    dst[p] = src[p];
    dst[p + 1] = src[p + 1];
    dst[p + 2] = src[p + 2];
    dst[p + 3] = mask[i];
  }

  if (spill > 0) decontaminate(dst, mask, width, height, spill);
  return out;
}

/**
 * Edge color decontamination (plan §6): at partially-transparent edge pixels,
 * pull the color away from the average color of fully-removed neighbors so the
 * old background doesn't fringe the subject.
 */
function decontaminate(
  dst: Uint8ClampedArray,
  mask: Mask,
  width: number,
  height: number,
  strength: number,
): void {
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const a = mask[i];
      if (a === 0 || a === 255) continue; // only the soft edge band

      // average color of fully-removed neighbors (the contaminating bg)
      let br = 0,
        bg = 0,
        bb = 0,
        n = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx,
            ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const ni = ny * width + nx;
          if (mask[ni] < 24) {
            const np = ni * 4;
            br += dst[np];
            bg += dst[np + 1];
            bb += dst[np + 2];
            n++;
          }
        }
      }
      if (!n) continue;
      br /= n;
      bg /= n;
      bb /= n;

      const p = i * 4;
      const t = (1 - a / 255) * strength; // more correction on more-transparent px
      dst[p] = clamp8(dst[p] + (dst[p] - br) * t);
      dst[p + 1] = clamp8(dst[p + 1] + (dst[p + 1] - bg) * t);
      dst[p + 2] = clamp8(dst[p + 2] + (dst[p + 2] - bb) * t);
    }
  }
}

function clamp8(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : v;
}

/** Composite onto a canvas context (the given ctx is sized to width×height). */
export function composite(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  input: CompositeInput,
): void {
  const { width, height, background } = input;
  ctx.clearRect(0, 0, width, height);

  // 1. draw the background layer
  if (background.kind === "color") {
    ctx.fillStyle = background.color;
    ctx.fillRect(0, 0, width, height);
  } else if (background.kind === "image") {
    // cover-fit the backdrop
    const b = background.bitmap;
    const scale = Math.max(width / b.width, height / b.height);
    const w = b.width * scale;
    const h = b.height * scale;
    ctx.drawImage(b, (width - w) / 2, (height - h) / 2, w, h);
  } else if (background.kind === "blur") {
    ctx.save();
    ctx.filter = `blur(${background.radius}px)`;
    const tmp = new OffscreenCanvas(width, height);
    const tctx = tmp.getContext("2d")!;
    tctx.putImageData(input.source, 0, 0);
    ctx.drawImage(tmp, 0, 0);
    ctx.restore();
    ctx.filter = "none";
  }
  // transparent: leave cleared (checkerboard shown by the DOM layer underneath)

  // 2. draw the cut-out on top
  const cut = cutout(input);
  const tmp = new OffscreenCanvas(width, height);
  tmp.getContext("2d")!.putImageData(cut, 0, 0);
  ctx.drawImage(tmp, 0, 0);
}

/** Render the final result to a Blob for download. */
export async function exportBlob(
  input: CompositeInput,
  opts: {
    format: "png" | "webp";
    maxSize?: number; // longest-side cap, 0/undefined = original
    trim?: boolean;
    trimBounds?: { x: number; y: number; w: number; h: number } | null;
  },
): Promise<Blob> {
  let srcCanvas = new OffscreenCanvas(input.width, input.height);
  composite(srcCanvas.getContext("2d")!, input);

  // trim to content
  if (opts.trim && opts.trimBounds) {
    const b = opts.trimBounds;
    const trimmed = new OffscreenCanvas(b.w, b.h);
    trimmed.getContext("2d")!.drawImage(srcCanvas, b.x, b.y, b.w, b.h, 0, 0, b.w, b.h);
    srcCanvas = trimmed;
  }

  // size preset
  if (opts.maxSize && opts.maxSize > 0) {
    const longest = Math.max(srcCanvas.width, srcCanvas.height);
    if (longest > opts.maxSize) {
      const scale = opts.maxSize / longest;
      const scaled = new OffscreenCanvas(
        Math.round(srcCanvas.width * scale),
        Math.round(srcCanvas.height * scale),
      );
      const sctx = scaled.getContext("2d")!;
      sctx.imageSmoothingQuality = "high";
      sctx.drawImage(srcCanvas, 0, 0, scaled.width, scaled.height);
      srcCanvas = scaled;
    }
  }

  const type = opts.format === "webp" ? "image/webp" : "image/png";
  return srcCanvas.convertToBlob({ type, quality: 0.92 });
}
