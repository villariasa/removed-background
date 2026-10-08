"use client";

import { useEditor, type Tool } from "@/lib/bg/store";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { PanelTitle } from "./Field";
import { Sparkles, ScanSearch, Brush, Eraser, Wand2, Lasso, Hand, Loader2, ImageUp } from "lucide-react";

export default function Toolbar({
  onAuto,
  onDetect,
  onReplace,
}: {
  onAuto: () => void;
  onDetect: () => void;
  onReplace: () => void;
}) {
  const tool = useEditor((s) => s.tool);
  const setTool = useEditor((s) => s.setTool);
  const status = useEditor((s) => s.status);
  const hasAuto = useEditor((s) => s.hasAuto);
  const detectStatus = useEditor((s) => s.detectStatus);
  const busy = status === "loading-model" || status === "processing";
  const detecting = detectStatus === "detecting";

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

      <Button
        variant="outline"
        className="mt-2 w-full"
        onClick={onDetect}
        disabled={busy || detecting}
      >
        {detecting ? (
          <>
            <Loader2 className="animate-spin" /> Detecting…
          </>
        ) : (
          <>
            <ScanSearch /> Detect objects
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
      </ToggleGroup>

      <ToggleGroup
        type="single"
        variant="outline"
        value={tool}
        onValueChange={(v) => v && setTool(v as Tool)}
        className="mt-2 w-full"
      >
        <ToggleGroupItem value="wand" aria-label="Magic wand — auto-select edges">
          <Wand2 /> Wand
        </ToggleGroupItem>
        <ToggleGroupItem value="lasso" aria-label="Lasso — freeform select">
          <Lasso /> Lasso
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
