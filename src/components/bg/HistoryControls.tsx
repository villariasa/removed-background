"use client";

import { useEditor } from "@/lib/bg/store";
import { Button } from "@/components/ui/button";
import { PanelTitle } from "./Field";
import { Undo2, Redo2, FlipHorizontal2 } from "lucide-react";

export default function HistoryControls() {
  const undo = useEditor((s) => s.undo);
  const redo = useEditor((s) => s.redo);
  const invert = useEditor((s) => s.invert);
  const historyIndex = useEditor((s) => s.historyIndex);
  const historyLen = useEditor((s) => s.history.length);

  return (
    <section>
      <PanelTitle>History</PanelTitle>
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          className="flex-1"
          onClick={undo}
          disabled={historyIndex <= 0}
          title="Undo (Ctrl/Cmd+Z)"
        >
          <Undo2 /> Undo
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="flex-1"
          onClick={redo}
          disabled={historyIndex >= historyLen - 1}
          title="Redo (Ctrl/Cmd+Shift+Z)"
        >
          <Redo2 /> Redo
        </Button>
        <Button variant="outline" size="sm" onClick={invert} title="Invert the mask (I)">
          <FlipHorizontal2 /> Invert
        </Button>
      </div>
    </section>
  );
}
