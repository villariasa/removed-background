"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useEditor } from "@/lib/bg/store";
import { applyRefine } from "@/lib/bg/mask";
import { composite, type Background } from "@/lib/bg/compositor";
import { strokeSegment } from "@/lib/bg/mask";

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
    }
  };

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

  const cursor = tool === "pan" ? "grab" : tool === "keep" || tool === "remove" ? "none" : "default";

  return (
    <div className="stageWrap checker" ref={wrapRef}>
      <canvas
        ref={canvasRef}
        className="canvas"
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

function StageStatus({ onFit }: { onFit: () => void }) {
  const status = useEditor((s) => s.status);
  const progress = useEditor((s) => s.progress);
  const label = useEditor((s) => s.progressLabel);
  const image = useEditor((s) => s.image);

  const busy = status === "loading-model" || status === "processing";

  return (
    <>
      {busy && (
        <div className="progress" role="status" aria-live="polite">
          <div className="bar">
            <div style={{ width: `${Math.round(progress * 100)}%` }} />
          </div>
          <div>{label || "Working…"}</div>
        </div>
      )}
      {image && (
        <div className="statusbar">
          <span>
            {image.width}×{image.height}px
          </span>
          <button className="btn" style={{ padding: "0.2rem 0.5rem" }} onClick={onFit}>
            Fit
          </button>
          <span style={{ marginLeft: "auto" }}>Scroll to zoom · Space-drag to pan</span>
        </div>
      )}
    </>
  );
}
