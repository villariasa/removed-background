"use client";

import { useEditor } from "@/lib/bg/store";
import { SliderField, PanelTitle } from "./Field";

export default function RefinePanel() {
  const refine = useEditor((s) => s.refine);
  const setRefine = useEditor((s) => s.setRefine);
  const hasAuto = useEditor((s) => s.hasAuto);

  return (
    <section>
      <PanelTitle>Edge refinement</PanelTitle>
      <div className="space-y-4">
        <SliderField
          label="Feather"
          value={refine.feather}
          min={0}
          max={20}
          suffix="px"
          onChange={(v) => setRefine({ feather: v })}
        />
        <SliderField
          label="Shift edge"
          value={refine.grow}
          min={-10}
          max={10}
          suffix="px"
          onChange={(v) => setRefine({ grow: v })}
        />
        <SliderField
          label="Harden"
          value={Math.round(refine.threshold * 100)}
          min={0}
          max={100}
          suffix="%"
          onChange={(v) => setRefine({ threshold: v / 100 })}
        />
        <SliderField
          label="Defringe (spill)"
          value={Math.round(refine.spill * 100)}
          min={0}
          max={100}
          suffix="%"
          onChange={(v) => setRefine({ spill: v / 100 })}
        />
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        {hasAuto
          ? "Non-destructive — applied live over the mask."
          : "Tip: run AI removal first, then refine the edges here."}
      </p>
    </section>
  );
}
