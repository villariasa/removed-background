"use client";

import { useEditor } from "@/lib/bg/store";
import { SliderField, PanelTitle } from "./Field";

export default function BrushControls() {
  const tool = useEditor((s) => s.tool);
  const brush = useEditor((s) => s.brush);
  const setBrush = useEditor((s) => s.setBrush);

  if (tool !== "keep" && tool !== "remove") return null;

  return (
    <section>
      <PanelTitle>Brush — {tool === "keep" ? "keep" : "remove"}</PanelTitle>
      <div className="space-y-4">
        <SliderField
          label="Size"
          value={brush.size}
          min={2}
          max={400}
          suffix="px"
          onChange={(v) => setBrush({ size: v })}
        />
        <SliderField
          label="Softness"
          value={Math.round(brush.softness * 100)}
          min={0}
          max={100}
          suffix="%"
          onChange={(v) => setBrush({ softness: v / 100 })}
        />
        <SliderField
          label="Flow"
          value={Math.round(brush.flow * 100)}
          min={5}
          max={100}
          suffix="%"
          onChange={(v) => setBrush({ flow: v / 100 })}
        />
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        <kbd className="rounded border px-1">[</kbd> / <kbd className="rounded border px-1">]</kbd>{" "}
        resize · <kbd className="rounded border px-1">K</kbd> keep ·{" "}
        <kbd className="rounded border px-1">E</kbd> remove. Stylus pressure supported.
      </p>
    </section>
  );
}
