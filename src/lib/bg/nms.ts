// Greedy non-max suppression, per label. Object detectors commonly return
// several heavily-overlapping boxes for the same physical object (different
// anchors/queries firing on the same thing); `post_process_object_detection`
// does no deduplication itself, so without this the UI shows duplicate
// clickable boxes stacked on top of each other.

export interface Box {
  label: string;
  score: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

function iou(a: Box, b: Box): number {
  const x0 = Math.max(a.x0, b.x0);
  const y0 = Math.max(a.y0, b.y0);
  const x1 = Math.min(a.x1, b.x1);
  const y1 = Math.min(a.y1, b.y1);
  const inter = Math.max(0, x1 - x0) * Math.max(0, y1 - y0);
  const areaA = (a.x1 - a.x0) * (a.y1 - a.y0);
  const areaB = (b.x1 - b.x0) * (b.y1 - b.y0);
  const union = areaA + areaB - inter;
  return union > 0 ? inter / union : 0;
}

export function nonMaxSuppression<T extends Box>(boxes: T[], iouThreshold = 0.5): T[] {
  const byLabel = new Map<string, T[]>();
  for (const b of boxes) {
    const arr = byLabel.get(b.label);
    if (arr) arr.push(b);
    else byLabel.set(b.label, [b]);
  }

  const kept: T[] = [];
  for (const group of byLabel.values()) {
    const sorted = [...group].sort((a, b) => b.score - a.score);
    const suppressed = new Array(sorted.length).fill(false);
    for (let i = 0; i < sorted.length; i++) {
      if (suppressed[i]) continue;
      kept.push(sorted[i]);
      for (let j = i + 1; j < sorted.length; j++) {
        if (!suppressed[j] && iou(sorted[i], sorted[j]) > iouThreshold) suppressed[j] = true;
      }
    }
  }
  return kept;
}
