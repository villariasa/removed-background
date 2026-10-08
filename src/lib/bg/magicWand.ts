// Magic-wand selection: click a pixel and select the region of similar color
// around it — the classic "select by clicking, snaps to edges" editor tool.
// The selection naturally stops where color changes beyond `tolerance`, which
// is what reads as "snapping to the edge" without needing a neural net.

export interface WandOptions {
  tolerance: number; // 0..100 — similarity threshold
  contiguous: boolean; // true = flood fill from the seed; false = select all matching pixels
}

const MAX_RGB_DIST = Math.sqrt(255 * 255 * 3);

/** Returns a 0/255 selection mask the same size as the source image. */
export function magicWandSelect(
  source: ImageData,
  width: number,
  height: number,
  seedX: number,
  seedY: number,
  tolerance: number,
  contiguous = true,
): Uint8ClampedArray {
  const sel = new Uint8ClampedArray(width * height);
  const sx = Math.round(seedX);
  const sy = Math.round(seedY);
  if (sx < 0 || sy < 0 || sx >= width || sy >= height) return sel;

  const data = source.data;
  const seedI = (sy * width + sx) * 4;
  const sr = data[seedI];
  const sg = data[seedI + 1];
  const sb = data[seedI + 2];
  const maxDist = (Math.max(0, Math.min(100, tolerance)) / 100) * MAX_RGB_DIST;

  const dist = (i: number) => {
    const dr = data[i] - sr;
    const dg = data[i + 1] - sg;
    const db = data[i + 2] - sb;
    return Math.sqrt(dr * dr + dg * dg + db * db);
  };

  if (!contiguous) {
    for (let p = 0, i = 0; p < sel.length; p++, i += 4) {
      if (dist(i) <= maxDist) sel[p] = 255;
    }
    return sel;
  }

  // 4-connected flood fill from the seed.
  const visited = new Uint8Array(width * height);
  const stack: number[] = [sy * width + sx];
  visited[sy * width + sx] = 1;

  while (stack.length) {
    const p = stack.pop()!;
    const i = p * 4;
    if (dist(i) > maxDist) continue;
    sel[p] = 255;

    const px = p % width;
    const py = (p - px) / width;
    if (px > 0) tryPush(p - 1);
    if (px < width - 1) tryPush(p + 1);
    if (py > 0) tryPush(p - width);
    if (py < height - 1) tryPush(p + width);
  }

  function tryPush(n: number) {
    if (!visited[n]) {
      visited[n] = 1;
      stack.push(n);
    }
  }

  return sel;
}
