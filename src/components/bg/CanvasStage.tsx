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

export default function CanvasStage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const offscreenRef = useRef<HTMLCanvasElement | null>(null);

  const image = useEditor((s) => s.image);
  const maskVersion = useEditor((s) => s.maskVersion);
  const refine = useEditor((s) => s.refine);
  const background = useEditor((s) => s.background);
  const tool = useEditor((s) => s.tool);

  const viewRef = useRef<View>({ scale: 1, ox: 0, oy: 0 });
  const [, force] = useState(0);
  const rerender = useCallback(() => force((n) => n + 1), []);

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
  }, []);

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

  const onPointerDown = (e: React.PointerEvent) => {
    // Right-click is reserved for the app's context menu — never start a
    // stroke/selection from it.
    if (e.button === 2) return;

    const t = useEditor.getState().tool;
    (e.target as Element).setPointerCapture(e.pointerId);
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
      <StageStatus onFit={fit} />
    </div>
  );
}

// Coarse stage derived from the worker's label, so the UI can highlight
// "Download → Load → Remove" even though the label text itself is granular
// (per-file names/percentages) and changes rapidly.
function stageFromLabel(label: string): 0 | 1 | 2 {
  const l = label.toLowerCase();
  if (l.includes("removing") || l.includes("finalizing")) return 2;
  if (l.includes("loading") || l.includes("falling back")) return 1;
  return 0;
}

const STAGES = ["Download", "Load", "Remove"];

function StageStatus({ onFit }: { onFit: () => void }) {
  const status = useEditor((s) => s.status);
  const progress = useEditor((s) => s.progress);
  const label = useEditor((s) => s.progressLabel);
  const image = useEditor((s) => s.image);

  const busy = status === "loading-model" || status === "processing";
  const pct = Math.round(progress * 100);
  const stage = stageFromLabel(label);

  return (
    <>
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
              First run downloads the model (~44&nbsp;MB on CPU, smaller with
              GPU acceleration) — cached after that.
            </p>
          )}
        </div>
      )}
      {image && (
        <div className="absolute inset-x-0 bottom-0 flex items-center gap-3 border-t bg-background/90 px-3 py-2 text-xs text-muted-foreground backdrop-blur">
          <span className="tabular-nums">
            {image.width}×{image.height}px
          </span>
          <Button variant="outline" size="sm" className="h-6 px-2 text-xs" onClick={onFit}>
            Fit
          </Button>
          <span className="ml-auto hidden sm:inline">Scroll to zoom · Space-drag to pan</span>
        </div>
      )}
    </>
  );
}
