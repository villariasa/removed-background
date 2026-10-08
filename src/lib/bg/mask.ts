// Single-channel alpha mask operations.
//
// The whole editor revolves around one grayscale alpha mask
// (Uint8ClampedArray, 1 byte/px, 0 = removed, 255 = kept) kept at the image's
// native resolution. Every tool reads/writes this mask; the preview is just
// originalRGB × mask. See plan §3 / §6.

export type Mask = Uint8ClampedArray;

export function createMask(width: number, height: number, fill = 255): Mask {
  const m = new Uint8ClampedArray(width * height);
  if (fill) m.fill(fill);
  return m;
}

export function cloneMask(mask: Mask): Mask {
  return new Uint8ClampedArray(mask);
}

export function invert(mask: Mask): void {
  for (let i = 0; i < mask.length; i++) mask[i] = 255 - mask[i];
}

export type BrushMode = "keep" | "remove";

/**
 * Stamp a single soft circular brush dab into the mask at (cx, cy).
 *
 * Softness in [0,1] controls the radial falloff; flow in [0,1] scales how much
 * of the target value is applied per dab. `keep` pushes toward 255 (max),
 * `remove` pushes toward 0 (min). See plan §6.
 */
export function stampBrush(
  mask: Mask,
  width: number,
  height: number,
  cx: number,
  cy: number,
  radius: number,
  softness: number,
  flow: number,
  mode: BrushMode,
): void {
  const r = Math.max(0.5, radius);
  const x0 = Math.max(0, Math.floor(cx - r));
  const x1 = Math.min(width - 1, Math.ceil(cx + r));
  const y0 = Math.max(0, Math.floor(cy - r));
  const y1 = Math.min(height - 1, Math.ceil(cy + r));
  // hardness = 1 - softness; avoid div-by-zero for a fully soft brush.
  const hardness = 1 - softness;
  const inner = hardness; // normalized radius where falloff begins

  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy) / r; // 0..>1
      if (dist > 1) continue;
      let a: number;
      if (dist <= inner) a = 1;
      else a = 1 - (dist - inner) / (1 - inner || 1);
      a = Math.max(0, Math.min(1, a)) * flow;
      if (a <= 0) continue;

      const idx = y * width + x;
      const cur = mask[idx];
      if (mode === "keep") {
        const target = 255;
        const next = cur + (target - cur) * a;
        if (next > cur) mask[idx] = next;
      } else {
        const target = 0;
        const next = cur + (target - cur) * a;
        if (next < cur) mask[idx] = next;
      }
    }
  }
}

/**
 * Stamp along the segment from (x0,y0) to (x1,y1), spacing dabs so fast drags
 * stay gap-free (spacing = radius * 0.25). See plan §6.
 */
export function strokeSegment(
  mask: Mask,
  width: number,
  height: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  radius: number,
  softness: number,
  flow: number,
  mode: BrushMode,
): void {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.sqrt(dx * dx + dy * dy);
  const spacing = Math.max(0.5, radius * 0.25);
  const steps = Math.max(1, Math.floor(len / spacing));
  for (let i = 0; i <= steps; i++) {
    const t = steps === 0 ? 0 : i / steps;
    stampBrush(
      mask,
      width,
      height,
      x0 + dx * t,
      y0 + dy * t,
      radius,
      softness,
      flow,
      mode,
    );
  }
}

// ---- Non-destructive global refinement passes (plan §4.4 / §6) ----

/** Separable box-blur approximation of a Gaussian, `radius` px. Feathers edges. */
export function feather(mask: Mask, width: number, height: number, radius: number): Mask {
  if (radius <= 0) return cloneMask(mask);
  const r = Math.round(radius);
  const tmp = new Float32Array(mask.length);
  const out = new Uint8ClampedArray(mask.length);
  const win = r * 2 + 1;

  // horizontal pass
  for (let y = 0; y < height; y++) {
    const row = y * width;
    let acc = 0;
    for (let x = -r; x <= r; x++) acc += mask[row + clamp(x, 0, width - 1)];
    for (let x = 0; x < width; x++) {
      tmp[row + x] = acc / win;
      const add = mask[row + clamp(x + r + 1, 0, width - 1)];
      const sub = mask[row + clamp(x - r, 0, width - 1)];
      acc += add - sub;
    }
  }
  // vertical pass
  for (let x = 0; x < width; x++) {
    let acc = 0;
    for (let y = -r; y <= r; y++) acc += tmp[clamp(y, 0, height - 1) * width + x];
    for (let y = 0; y < height; y++) {
      out[y * width + x] = acc / win;
      const add = tmp[clamp(y + r + 1, 0, height - 1) * width + x];
      const sub = tmp[clamp(y - r, 0, height - 1) * width + x];
      acc += add - sub;
    }
  }
  return out;
}

/** Morphological erode (shrink) or dilate (grow) by `px` with a square kernel. */
export function shiftEdge(mask: Mask, width: number, height: number, px: number): Mask {
  if (px === 0) return cloneMask(mask);
  const grow = px > 0;
  const r = Math.abs(Math.round(px));
  let src = cloneMask(mask);
  // Apply r single-pixel passes (cheap, adequate for small shifts).
  for (let pass = 0; pass < r; pass++) {
    const out = new Uint8ClampedArray(src.length);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let v = src[y * width + x];
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = clamp(x + dx, 0, width - 1);
            const ny = clamp(y + dy, 0, height - 1);
            const n = src[ny * width + nx];
            v = grow ? Math.max(v, n) : Math.min(v, n);
          }
        }
        out[y * width + x] = v;
      }
    }
    src = out;
  }
  return src;
}

/** Push mid values toward 0/255 around a threshold to harden a fuzzy matte. */
export function threshold(mask: Mask, amount: number): Mask {
  // amount in [0,1]; 0 = no change, 1 = hard binary at 128.
  const out = new Uint8ClampedArray(mask.length);
  const k = amount * 8; // steepness
  for (let i = 0; i < mask.length; i++) {
    if (amount <= 0) {
      out[i] = mask[i];
      continue;
    }
    const v = mask[i] / 255;
    const s = 1 / (1 + Math.exp(-k * (v - 0.5)));
    out[i] = s * 255;
  }
  return out;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export interface Refine {
  feather: number;
  grow: number;
  threshold: number;
}

/**
 * Apply the non-destructive global refinement passes in order
 * (grow/shrink → feather → threshold). Returns a new mask; the base mask that
 * the brush edits is never mutated. If no params are active, returns a clone.
 */
export function applyRefine(
  base: Mask,
  width: number,
  height: number,
  r: Refine,
): Mask {
  if (!r.feather && !r.grow && !r.threshold) return cloneMask(base);
  let m = base;
  if (r.grow) m = shiftEdge(m, width, height, r.grow);
  if (r.feather) m = feather(m, width, height, r.feather);
  if (r.threshold) m = threshold(m, r.threshold);
  // ensure we return a distinct buffer even when only one pass ran on `base`
  return m === base ? cloneMask(base) : m;
}

/** Bounding box of kept (alpha > threshold) pixels, for trim-to-content export. */
export function contentBounds(
  mask: Mask,
  width: number,
  height: number,
  threshold = 8,
): { x: number; y: number; w: number; h: number } | null {
  let minX = width,
    minY = height,
    maxX = -1,
    maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (mask[y * width + x] > threshold) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}
