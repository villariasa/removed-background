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

export default function RefinePanel() {
  const refine = useEditor((s) => s.refine);
  const setRefine = useEditor((s) => s.setRefine);
  const hasAuto = useEditor((s) => s.hasAuto);

  return (
    <div className="panel">
      <h3>Edge refinement</h3>
      <Slider
        label="Feather"
        value={refine.feather}
        min={0}
        max={20}
        step={1}
        suffix="px"
        onChange={(v) => setRefine({ feather: v })}
      />
      <Slider
        label="Shift edge"
        value={refine.grow}
        min={-10}
        max={10}
        step={1}
        suffix="px"
        onChange={(v) => setRefine({ grow: v })}
      />
      <Slider
        label="Harden"
        value={Math.round(refine.threshold * 100)}
        min={0}
        max={100}
        step={1}
        suffix="%"
        onChange={(v) => setRefine({ threshold: v / 100 })}
      />
      <Slider
        label="Defringe (spill)"
        value={Math.round(refine.spill * 100)}
        min={0}
        max={100}
        step={1}
        suffix="%"
        onChange={(v) => setRefine({ spill: v / 100 })}
      />
      <p className="hint">
        {hasAuto
          ? "Non-destructive — applied live over the mask."
          : "Tip: run AI removal first, then refine the edges here."}
      </p>
    </div>
  );
}
