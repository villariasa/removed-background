"use client";

import { useEditor, type Tool } from "@/lib/bg/store";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { PanelTitle } from "./Field";
import { Sparkles, Brush, Eraser, Hand, Loader2, ImageUp } from "lucide-react";

export default function Toolbar({
  onAuto,
  onReplace,
}: {
  onAuto: () => void;
  onReplace: () => void;
}) {
  const tool = useEditor((s) => s.tool);
  const setTool = useEditor((s) => s.setTool);
  const status = useEditor((s) => s.status);
  const hasAuto = useEditor((s) => s.hasAuto);
  const busy = status === "loading-model" || status === "processing";

  return (
    <section>
      <PanelTitle>Tools</PanelTitle>
      <Button className="w-full" onClick={onAuto} disabled={busy}>
        {busy ? (
          <>
            <Loader2 className="animate-spin" /> Working…
          </>
        ) : (
          <>
            <Sparkles /> {hasAuto ? "Re-run AI removal" : "Remove background"}
          </>
        )}
      </Button>

      <ToggleGroup
        type="single"
        variant="outline"
        value={tool}
        onValueChange={(v) => v && setTool(v as Tool)}
        className="mt-3 w-full"
      >
        <ToggleGroupItem value="keep" aria-label="Keep brush">
          <Brush /> Keep
        </ToggleGroupItem>
        <ToggleGroupItem value="remove" aria-label="Remove brush">
          <Eraser /> Remove
        </ToggleGroupItem>
        <ToggleGroupItem value="pan" aria-label="Pan">
          <Hand /> Pan
        </ToggleGroupItem>
      </ToggleGroup>

      <Button variant="outline" className="mt-3 w-full" onClick={onReplace}>
        <ImageUp /> Open a different image
      </Button>
    </section>
  );
}
