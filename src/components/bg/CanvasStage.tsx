"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useEditor, type SelectMode } from "@/lib/bg/store";
import { applyRefine, strokeSegment } from "@/lib/bg/mask";
import { composite, type Background } from "@/lib/bg/compositor";
import { magicWandSelect } from "@/lib/bg/magicWand";
import { polygonSelect, simplifyPath, type Point } from "@/lib/bg/lasso";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

interface View {
  scale: number;
  ox: number;
  oy: number;
}

export default function CanvasStage({
  onApplyDetections,
}: {
  onApplyDetections: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const offscreenRef = useRef<HTMLCanvasElement | null>(null);

  const image = useEditor((s) => s.image);
  const maskVersion = useEditor((s) => s.maskVersion);
  const refine = useEditor((s) => s.refine);
  const background = useEditor((s) => s.background);
  const tool = useEditor((s) => s.tool);
  const detections = useEditor((s) => s.detections);

  const viewRef = useRef<View>({ scale: 1, ox: 0, oy: 0 });
  const [, force] = useState(0);
  const rerender = useCallback(() => force((n) => n + 1), []);
  const boxElsRef = useRef<Map<number, HTMLButtonElement>>(new Map());

  // Keep the detection-box overlay in sync with the current pan/zoom. Called
  // from paint() (imperative, like the brush cursor) so dragging/zooming
  // stays smooth without a React re-render per frame.
  const syncBoxPositions = useCallback(() => {
    const v = viewRef.current;
    for (const d of useEditor.getState().detections) {
      const el = boxElsRef.current.get(d.id);
      if (!el) continue;
      el.style.left = `${d.x0 * v.scale + v.ox}px`;
      el.style.top = `${d.y0 * v.scale + v.oy}px`;
      el.style.width = `${(d.x1 - d.x0) * v.scale}px`;
      el.style.height = `${(d.y1 - d.y0) * v.scale}px`;
    }
  }, []);

  const pointer = useRef<{ x: number; y: number; inside: boolean }>({
    x: 0,
    y: 0,
    inside: false,
  });
  const drawing = useRef(false);
  const panning = useRef(false);
  const spaceHeld = useRef(false);
  const lastImgPt = useRef<{ x: number; y: number } | null>(null);
  const lastPan = useRef<{ x: number; y: number } | null>(null);
  const rafRef = useRef<number | null>(null);
  const lassoActive = useRef(false);
  const lassoPoints = useRef<Point[]>([]);

  // Pinch-to-zoom / two-finger pan — the only way to zoom on a touchscreen
  // (there's no wheel event). Tracked separately from the single-pointer
  // brush/pan/lasso logic below; a second touch coming down mid-gesture
  // cancels whatever the first touch was doing and takes over.
  const activeTouches = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinch = useRef<{ dist: number; midX: number; midY: number } | null>(null);

  // (Re)build the offscreen image-resolution composite whenever the mask,
  // refine params, background, or image changes.
  const buildComposite = useCallback(() => {
    const img = useEditor.getState().image;
    if (!img) return;
    let off = offscreenRef.current;
    if (!off || off.width !== img.width || off.height !== img.height) {
      off = document.createElement("canvas");
      off.width = img.width;
      off.height = img.height;
      offscreenRef.current = off;
    }
    const base = useEditor.getState().baseMask;
    if (!base) return;
    const r = useEditor.getState().refine;
    const eff = applyRefine(base, img.width, img.height, r);
    const ctx = off.getContext("2d")!;
    composite(ctx, {
      source: img.imageData,
      mask: eff,
      width: img.width,
      height: img.height,
      background: useEditor.getState().background as Background,
      spill: useEditor.getState().refine.spill,
    });
    paint();
  }, []);

  // Paint the offscreen onto the visible canvas with the current view transform.
  const paint = useCallback(() => {
    const canvas = canvasRef.current;
    const off = offscreenRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !off || !wrap) return;
    const dpr = window.devicePixelRatio || 1;
    const cw = wrap.clientWidth;
    const ch = wrap.clientHeight;
    if (canvas.width !== cw * dpr || canvas.height !== ch * dpr) {
      canvas.width = Math.max(1, Math.floor(cw * dpr));
      canvas.height = Math.max(1, Math.floor(ch * dpr));
    }
    const ctx = canvas.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cw, ch);

    const v = viewRef.current;
    ctx.imageSmoothingEnabled = v.scale < 3;
    ctx.save();
    ctx.translate(v.ox, v.oy);
    ctx.scale(v.scale, v.scale);
    ctx.drawImage(off, 0, 0);
    ctx.restore();

    syncBoxPositions();

    // brush cursor ring
    const t = useEditor.getState().tool;
    if (pointer.current.inside && (t === "keep" || t === "remove")) {
      const brush = useEditor.getState().brush;
      const rad = (brush.size / 2) * v.scale;
      ctx.beginPath();
      ctx.arc(pointer.current.x, pointer.current.y, rad, 0, Math.PI * 2);
      ctx.strokeStyle = t === "keep" ? "rgba(22,163,74,0.9)" : "rgba(220,38,38,0.9)";
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.strokeStyle = "rgba(255,255,255,0.7)";
      ctx.lineWidth = 0.75;
      ctx.stroke();
    }

    // live lasso path preview
    if (t === "lasso" && lassoPoints.current.length > 1) {
      ctx.save();
      ctx.translate(v.ox, v.oy);
      ctx.scale(v.scale, v.scale);
      ctx.beginPath();
      ctx.moveTo(lassoPoints.current[0].x, lassoPoints.current[0].y);
      for (const pt of lassoPoints.current.slice(1)) ctx.lineTo(pt.x, pt.y);
      if (!lassoActive.current) ctx.closePath();
      ctx.setLineDash([6 / v.scale, 4 / v.scale]);
      ctx.lineWidth = 1.5 / v.scale;
      ctx.strokeStyle = "rgba(37,99,235,0.95)";
      ctx.stroke();
      ctx.setLineDash([]);
      if (lassoActive.current) {
        ctx.fillStyle = "rgba(37,99,235,0.08)";
        ctx.fill();
      }
      ctx.restore();
    }
  }, [syncBoxPositions]);

  const scheduleePaint = useCallback(() => {
    if (rafRef.current != null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      paint();
    });
  }, [paint]);

  // Fit image to the stage when a new image loads.
  const fit = useCallback(() => {
    const img = useEditor.getState().image;
    const wrap = wrapRef.current;
    if (!img || !wrap) return;
    const cw = wrap.clientWidth;
    const ch = wrap.clientHeight;
    const scale = Math.min(cw / img.width, ch / img.height) * 0.92;
    viewRef.current = {
      scale,
      ox: (cw - img.width * scale) / 2,
      oy: (ch - img.height * scale) / 2,
    };
    rerender();
  }, [rerender]);

  useEffect(() => {
    if (image) fit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [image?.name, image?.width, image?.height]);

  useEffect(() => {
    buildComposite();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [maskVersion, refine, background, image]);

  // New detection-box elements need their position set as soon as they
  // mount (paint() only runs on pan/zoom/mask changes otherwise).
  useEffect(() => {
    syncBoxPositions();
  }, [detections, syncBoxPositions]);

  // keep canvas sized to container
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const ro = new ResizeObserver(() => paint());
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [paint]);

  // keyboard: space to pan
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === "Space") spaceHeld.current = true;
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "Space") spaceHeld.current = false;
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  function toImage(clientX: number, clientY: number) {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const sx = clientX - rect.left;
    const sy = clientY - rect.top;
    const v = viewRef.current;
    return { x: (sx - v.ox) / v.scale, y: (sy - v.oy) / v.scale, sx, sy };
  }

  function pinchGeometry(): { dist: number; midX: number; midY: number } | null {
    const pts = [...activeTouches.current.values()];
    if (pts.length < 2) return null;
    const [a, b] = pts;
    return {
      dist: Math.hypot(a.x - b.x, a.y - b.y),
      midX: (a.x + b.x) / 2,
      midY: (a.y + b.y) / 2,
    };
  }

  function cancelSinglePointerGestures() {
    if (drawing.current) {
      drawing.current = false;
      lastImgPt.current = null;
    }
    if (lassoActive.current) {
      lassoActive.current = false;
      lassoPoints.current = [];
    }
    panning.current = false;
    lastPan.current = null;
  }

  const onPointerDown = (e: React.PointerEvent) => {
    // Right-click is reserved for the app's context menu — never start a
    // stroke/selection from it.
    if (e.button === 2) return;

    if (e.pointerType === "touch") {
      try {
        (e.target as Element).setPointerCapture(e.pointerId);
      } catch {}
      activeTouches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (activeTouches.current.size === 2) {
        cancelSinglePointerGestures();
        pinch.current = pinchGeometry();
        return;
      }
      if (activeTouches.current.size > 2) return; // ignore a 3rd+ finger
    }

    const t = useEditor.getState().tool;
    try {
      (e.target as Element).setPointerCapture(e.pointerId);
    } catch {}
    const isPan = t === "pan" || spaceHeld.current || e.button === 1;
    if (isPan) {
      panning.current = true;
      lastPan.current = { x: e.clientX, y: e.clientY };
      return;
    }
    if (t === "keep" || t === "remove") {
      drawing.current = true;
      const p = toImage(e.clientX, e.clientY);
      lastImgPt.current = { x: p.x, y: p.y };
      paintStroke(p.x, p.y, p.x, p.y, e.pressure);
      return;
    }
    if (t === "wand") {
      const p = toImage(e.clientX, e.clientY);
      runWandSelect(p.x, p.y, effectiveSelectMode(e));
      return;
    }
    if (t === "lasso") {
      const p = toImage(e.clientX, e.clientY);
      lassoActive.current = true;
      lassoPoints.current = [{ x: p.x, y: p.y }];
    }
  };

  function effectiveSelectMode(e: { altKey: boolean }): SelectMode {
    const mode = useEditor.getState().selectMode;
    if (!e.altKey) return mode;
    return mode === "add" ? "subtract" : "add";
  }

  function runWandSelect(x: number, y: number, mode: SelectMode) {
    const st = useEditor.getState();
    const img = st.image;
    if (!img) return;
    const sel = magicWandSelect(
      img.imageData,
      img.width,
      img.height,
      x,
      y,
      st.wand.tolerance,
      st.wand.contiguous,
    );
    st.applySelection(sel, mode);
    scheduleBuild();
  }

  const onPointerMove = (e: React.PointerEvent) => {
    if (e.pointerType === "touch" && activeTouches.current.has(e.pointerId)) {
      activeTouches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (activeTouches.current.size >= 2) {
        const next = pinchGeometry();
        if (next && pinch.current) {
          const v = viewRef.current;
          const prev = pinch.current;
          const factor = prev.dist > 0 ? next.dist / prev.dist : 1;
          const newScale = Math.max(0.05, Math.min(40, v.scale * factor));
          // zoom around the pinch midpoint, then pan by how much the
          // midpoint itself moved (two-finger drag pans).
          const rect = canvasRef.current!.getBoundingClientRect();
          const sx = next.midX - rect.left;
          const sy = next.midY - rect.top;
          v.ox = sx - (sx - v.ox) * (newScale / v.scale);
          v.oy = sy - (sy - v.oy) * (newScale / v.scale);
          v.scale = newScale;
          v.ox += next.midX - prev.midX;
          v.oy += next.midY - prev.midY;
          scheduleePaint();
        }
        pinch.current = next;
        return;
      }
    }

    const p = toImage(e.clientX, e.clientY);
    pointer.current = { x: p.sx, y: p.sy, inside: true };

    if (panning.current && lastPan.current) {
      const v = viewRef.current;
      v.ox += e.clientX - lastPan.current.x;
      v.oy += e.clientY - lastPan.current.y;
      lastPan.current = { x: e.clientX, y: e.clientY };
      scheduleePaint();
      return;
    }
    if (drawing.current && lastImgPt.current) {
      paintStroke(lastImgPt.current.x, lastImgPt.current.y, p.x, p.y, e.pressure);
      lastImgPt.current = { x: p.x, y: p.y };
    } else if (lassoActive.current) {
      lassoPoints.current = [...lassoPoints.current, { x: p.x, y: p.y }];
      scheduleePaint();
    } else {
      scheduleePaint();
    }
  };

  const endStroke = (e: React.PointerEvent) => {
    if (e.pointerType === "touch") {
      activeTouches.current.delete(e.pointerId);
      if (activeTouches.current.size < 2) pinch.current = null;
      if (activeTouches.current.size > 0) {
        // A finger lifted mid-pinch but another is still down — don't let
        // the remaining single touch fall through into drawing/panning.
        try {
          (e.target as Element).releasePointerCapture(e.pointerId);
        } catch {}
        return;
      }
    }
    if (drawing.current) {
      drawing.current = false;
      lastImgPt.current = null;
      useEditor.getState().commitStroke();
    }
    if (lassoActive.current) {
      lassoActive.current = false;
      const img = useEditor.getState().image;
      const path = simplifyPath(lassoPoints.current, 1.5);
      if (img && path.length >= 3) {
        const sel = polygonSelect(path, img.width, img.height);
        useEditor.getState().applySelection(sel, effectiveSelectMode(e));
        scheduleBuild();
      }
      lassoPoints.current = [];
      scheduleePaint();
    }
    if (panning.current) {
      panning.current = false;
      lastPan.current = null;
    }
    try {
      (e.target as Element).releasePointerCapture(e.pointerId);
    } catch {}
  };

  function paintStroke(x0: number, y0: number, x1: number, y1: number, pressure: number) {
    const st = useEditor.getState();
    const img = st.image;
    const base = st.baseMask;
    if (!img || !base) return;
    const flow = st.brush.flow * (pressure > 0 && pressure < 1 ? pressure : 1);
    strokeSegment(
      base,
      img.width,
      img.height,
      x0,
      y0,
      x1,
      y1,
      st.brush.size / 2,
      st.brush.softness,
      flow,
      st.tool === "keep" ? "keep" : "remove",
    );
    // re-composite the mask (refine is usually off while brushing) on rAF
    scheduleBuild();
  }

  const buildScheduled = useRef(false);
  const scheduleBuild = useCallback(() => {
    if (buildScheduled.current) return;
    buildScheduled.current = true;
    requestAnimationFrame(() => {
      buildScheduled.current = false;
      buildComposite();
    });
  }, [buildComposite]);

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const v = viewRef.current;
    const rect = canvasRef.current!.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    const newScale = Math.max(0.05, Math.min(40, v.scale * factor));
    // zoom around cursor
    v.ox = sx - (sx - v.ox) * (newScale / v.scale);
    v.oy = sy - (sy - v.oy) * (newScale / v.scale);
    v.scale = newScale;
    scheduleePaint();
  };

  const cursor =
    tool === "pan"
      ? "grab"
      : tool === "keep" || tool === "remove"
        ? "none"
        : tool === "wand" || tool === "lasso"
          ? "crosshair"
          : "default";

  return (
    <div className="checker absolute inset-0 overflow-hidden" ref={wrapRef}>
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full touch-none"
        style={{ cursor }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endStroke}
        onPointerCancel={endStroke}
        onPointerLeave={() => {
          pointer.current.inside = false;
          scheduleePaint();
        }}
        onPointerEnter={() => {
          pointer.current.inside = true;
        }}
        onWheel={onWheel}
      />

      {detections.length > 0 && (
        <div className="pointer-events-none absolute inset-0 z-10">
          {/* Largest-area first, so a smaller box nested inside a bigger one
              paints on top and stays clickable (NMS removes most overlap,
              but distinct objects can still legitimately nest, e.g. a held
              item inside a person's box). */}
          {[...detections]
            .sort((a, b) => (b.x1 - b.x0) * (b.y1 - b.y0) - (a.x1 - a.x0) * (a.y1 - a.y0))
            .map((d) => (
            <button
              key={d.id}
              ref={(el) => {
                if (el) boxElsRef.current.set(d.id, el);
                else boxElsRef.current.delete(d.id);
              }}
              onClick={() => useEditor.getState().toggleDetection(d.id)}
              className={`pointer-events-auto absolute flex items-start justify-start rounded-sm border-2 text-left transition-colors ${
                d.selected
                  ? "border-primary bg-primary/10"
                  : "border-muted-foreground/40 bg-transparent"
              }`}
              title={`${d.label} (${Math.round(d.score * 100)}%) — click to ${d.selected ? "exclude" : "include"}`}
            >
              <span
                className={`-translate-y-full rounded-sm px-1.5 py-0.5 text-xs font-medium whitespace-nowrap ${
                  d.selected
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted-foreground/70 text-background"
                }`}
              >
                {d.label} {Math.round(d.score * 100)}%
              </span>
            </button>
          ))}
        </div>
      )}

      <StageStatus onFit={fit} />
      <DetectionActionBar onApply={onApplyDetections} />
    </div>
  );
}

function DetectionActionBar({ onApply }: { onApply: () => void }) {
  const detections = useEditor((s) => s.detections);
  const detectStatus = useEditor((s) => s.detectStatus);
  const toggleAll = useEditor((s) => s.selectAllDetections);
  const clear = useEditor((s) => s.clearDetections);

  if (detections.length === 0) return null;
  const selectedCount = detections.filter((d) => d.selected).length;
  const busy = detectStatus === "segmenting";

  return (
    <div className="absolute top-3 right-3 left-3 z-20 flex flex-wrap items-center justify-center gap-1.5 rounded-lg border bg-popover/95 p-1.5 text-sm shadow-md backdrop-blur md:left-auto md:justify-end md:gap-2 md:p-2">
      <span className="px-1 text-xs text-muted-foreground">
        {selectedCount}/{detections.length} selected
      </span>
      <Button
        variant="outline"
        size="sm"
        className="h-9 px-3 text-sm md:h-7 md:px-2 md:text-xs"
        onClick={() => toggleAll(true)}
        disabled={busy}
      >
        All
      </Button>
      <Button
        variant="outline"
        size="sm"
        className="h-9 px-3 text-sm md:h-7 md:px-2 md:text-xs"
        onClick={() => toggleAll(false)}
        disabled={busy}
      >
        None
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="h-9 px-3 text-sm md:h-7 md:px-2 md:text-xs"
        onClick={clear}
        disabled={busy}
      >
        Cancel
      </Button>
      <Button
        size="sm"
        className="h-9 px-3 text-sm md:h-7 md:px-2 md:text-xs"
        onClick={onApply}
        disabled={busy || selectedCount === 0}
      >
        {busy ? "Applying…" : `Apply (${selectedCount})`}
      </Button>
    </div>
  );
}

// Coarse stage derived from the worker's label, so the UI can highlight
// "Download → Load → Remove" even though the label text itself is granular
// (per-file names/percentages) and changes rapidly.
function stageFromLabel(label: string): 0 | 1 | 2 {
  const l = label.toLowerCase();
  if (
    l.includes("removing") ||
    l.includes("finalizing") ||
    l.includes("detecting") ||
    l.includes("analyzing") ||
    l.includes("segmenting")
  )
    return 2;
  if (l.includes("loading") || l.includes("falling back")) return 1;
  return 0;
}

const STAGES = ["Download", "Load", "Process"];

function StageStatus({ onFit }: { onFit: () => void }) {
  const status = useEditor((s) => s.status);
  const progress = useEditor((s) => s.progress);
  const label = useEditor((s) => s.progressLabel);
  const image = useEditor((s) => s.image);
  const error = useEditor((s) => s.error);
  const setError = useEditor((s) => s.setError);

  const busy = status === "loading-model" || status === "processing";
  const pct = Math.round(progress * 100);
  const stage = stageFromLabel(label);

  return (
    <>
      {/* Errors from a failed AI run etc. — Dropzone only shows its own error
          box while no image is loaded, so this is the only error surface
          once an image exists. Without it, a failed runAuto() silently
          reverts to "ready" with zero visible feedback. */}
      {!busy && error && image && (
        <div
          role="alert"
          className="absolute inset-x-3 top-3 z-20 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive shadow-sm"
        >
          <span className="flex-1">{error}</span>
          <button
            onClick={() => setError(null)}
            aria-label="Dismiss"
            className="shrink-0 text-destructive/70 hover:text-destructive"
          >
            ✕
          </button>
        </div>
      )}
      {busy && (
        <div
          className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-background/85 backdrop-blur-sm"
          role="status"
          aria-live="polite"
        >
          <div className="flex items-center gap-3">
            <Loader2 className="size-5 animate-spin text-primary" />
            <span className="text-2xl font-semibold tabular-nums">{pct}%</span>
          </div>

          <div className="h-1.5 w-64 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-primary transition-[width] duration-200"
              style={{ width: `${pct}%` }}
            />
          </div>

          <div className="min-h-5 max-w-xs truncate text-center text-sm text-muted-foreground">
            {label || "Working…"}
          </div>

          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {STAGES.map((s, i) => (
              <span key={s} className="flex items-center gap-2">
                <span
                  className={
                    i < stage
                      ? "font-medium text-primary"
                      : i === stage
                        ? "font-medium text-foreground"
                        : "text-muted-foreground/60"
                  }
                >
                  {s}
                </span>
                {i < STAGES.length - 1 && <span className="text-muted-foreground/40">›</span>}
              </span>
            ))}
          </div>

          {stage === 0 && (
            <p className="max-w-xs text-center text-xs text-muted-foreground/70">
              First use of each tool downloads its model (a few MB to ~44&nbsp;MB) —
              cached after that.
            </p>
          )}
        </div>
      )}
      {image && (
        <div className="absolute inset-x-0 bottom-0 flex items-center gap-3 border-t bg-background/90 px-3 py-2 text-xs text-muted-foreground backdrop-blur">
          <span className="tabular-nums">
            {image.width}×{image.height}px
          </span>
          <Button
            variant="outline"
            size="sm"
            className="h-8 px-3 text-xs md:h-6 md:px-2"
            onClick={onFit}
          >
            Fit
          </Button>
          <span className="ml-auto hidden sm:inline">Scroll to zoom · Space-drag to pan</span>
        </div>
      )}
    </>
  );
}
