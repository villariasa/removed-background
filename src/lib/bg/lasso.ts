// Freehand/lasso selection: rasterize an arbitrary closed path (the pointer's
// drag trail) into a 0/255 selection mask via scanline polygon fill
// (even-odd rule). Lets the user free-select any shape, not just a circle.

export interface Point {
  x: number;
  y: number;
}

export function polygonSelect(
  points: Point[],
  width: number,
  height: number,
): Uint8ClampedArray {
  const sel = new Uint8ClampedArray(width * height);
  if (points.length < 3) return sel;

  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  const y0 = Math.max(0, Math.floor(minY));
  const y1 = Math.min(height - 1, Math.ceil(maxY));

  for (let y = y0; y <= y1; y++) {
    const scanY = y + 0.5;
    const xs: number[] = [];
    for (let i = 0; i < points.length; i++) {
      const a = points[i];
      const b = points[(i + 1) % points.length];
      if ((a.y <= scanY && b.y > scanY) || (b.y <= scanY && a.y > scanY)) {
        const t = (scanY - a.y) / (b.y - a.y);
        xs.push(a.x + t * (b.x - a.x));
      }
    }
    xs.sort((a, b) => a - b);
    for (let i = 0; i + 1 < xs.length; i += 2) {
      const x0 = Math.max(0, Math.round(xs[i]));
      const x1 = Math.min(width - 1, Math.round(xs[i + 1]) - 1);
      const row = y * width;
      for (let x = x0; x <= x1; x++) sel[row + x] = 255;
    }
  }
  return sel;
}

/** Drop points closer than `minDist` apart so long drags don't balloon the array. */
export function simplifyPath(points: Point[], minDist = 2): Point[] {
  if (points.length <= 2) return points;
  const out: Point[] = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const last = out[out.length - 1];
    const dx = points[i].x - last.x;
    const dy = points[i].y - last.y;
    if (dx * dx + dy * dy >= minDist * minDist) out.push(points[i]);
  }
  return out;
}
