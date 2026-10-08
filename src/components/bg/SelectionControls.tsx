"use client";

import { useEditor, type SelectMode } from "@/lib/bg/store";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { SliderField, PanelTitle } from "./Field";
import { Brush, Eraser } from "lucide-react";

export default function SelectionControls() {
  const tool = useEditor((s) => s.tool);
  const selectMode = useEditor((s) => s.selectMode);
  const setSelectMode = useEditor((s) => s.setSelectMode);
  const wand = useEditor((s) => s.wand);
  const setWand = useEditor((s) => s.setWand);

  if (tool !== "wand" && tool !== "lasso") return null;

  return (
    <section>
      <PanelTitle>{tool === "wand" ? "Magic wand" : "Lasso select"}</PanelTitle>

      <ToggleGroup
        type="single"
        variant="outline"
        value={selectMode}
        onValueChange={(v) => v && setSelectMode(v as SelectMode)}
        className="w-full"
      >
        <ToggleGroupItem value="subtract" size="sm">
          <Eraser /> Remove
        </ToggleGroupItem>
        <ToggleGroupItem value="add" size="sm">
          <Brush /> Keep
        </ToggleGroupItem>
      </ToggleGroup>

      {tool === "wand" && (
        <div className="mt-4 space-y-3">
          <SliderField
            label="Tolerance"
            value={wand.tolerance}
            min={1}
            max={100}
            suffix="%"
            onChange={(v) => setWand({ tolerance: v })}
          />
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={wand.contiguous}
              onChange={(e) => setWand({ contiguous: e.target.checked })}
              className="size-4 accent-primary"
            />
            Limit to connected area
          </label>
        </div>
      )}

      <p className="mt-3 text-xs text-muted-foreground">
        {tool === "wand"
          ? `Click a region to select similar-colored pixels, snapping to its edges — currently ${selectMode === "subtract" ? "removes" : "keeps"} what you click. Hold Alt to flip.`
          : `Drag to draw a freeform outline, release to apply — currently ${selectMode === "subtract" ? "removes" : "keeps"} the outlined area. Hold Alt to flip.`}
      </p>
    </section>
  );
}
