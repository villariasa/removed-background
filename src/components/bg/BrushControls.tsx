"use client";

import { useEditor } from "@/lib/bg/store";

function Slider({
  label,
  value,
  min,
  max,
  step,
  suffix,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix?: string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="field">
      <label>
        <span>{label}</span>
        <span className="val">
          {value}
          {suffix}
        </span>
      </label>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}

export default function BrushControls() {
  const tool = useEditor((s) => s.tool);
  const brush = useEditor((s) => s.brush);
  const setBrush = useEditor((s) => s.setBrush);

  if (tool !== "keep" && tool !== "remove") return null;

  return (
    <div className="panel">
      <h3>Brush — {tool === "keep" ? "keep" : "remove"}</h3>
      <Slider
        label="Size"
        value={brush.size}
        min={2}
        max={400}
        step={1}
        suffix="px"
        onChange={(v) => setBrush({ size: v })}
      />
      <Slider
        label="Softness"
        value={Math.round(brush.softness * 100)}
        min={0}
        max={100}
        step={1}
        suffix="%"
        onChange={(v) => setBrush({ softness: v / 100 })}
      />
      <Slider
        label="Flow"
        value={Math.round(brush.flow * 100)}
        min={5}
        max={100}
        step={1}
        suffix="%"
        onChange={(v) => setBrush({ flow: v / 100 })}
      />
      <p className="hint">
        <code>[</code> / <code>]</code> resize · <code>K</code> keep · <code>E</code> remove.
        Pressure-sensitive with a stylus.
      </p>
    </div>
  );
}
