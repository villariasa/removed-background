"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useEditor } from "@/lib/bg/store";
import { bitmapToImageData, validateAndDecode } from "@/lib/bg/image";
import { autoMatte, detectObjects, samPrepare, samSegment } from "@/lib/bg/worker/client";
import { downloadCurrent } from "@/lib/bg/download";
import CanvasStage from "./CanvasStage";
import Dropzone from "./Dropzone";
import Toolbar from "./Toolbar";
import BrushControls from "./BrushControls";
import SelectionControls from "./SelectionControls";
import RefinePanel from "./RefinePanel";
import BackgroundPanel from "./BackgroundPanel";
import ExportBar from "./ExportBar";
import HistoryControls from "./HistoryControls";
import ContextMenu, { type ContextMenuItem } from "./ContextMenu";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Keyboard,
  Brush,
  Eraser,
  Wand2,
  Lasso,
  Hand,
  Undo2,
  Redo2,
  FlipHorizontal2,
  Sparkles,
  ScanSearch,
  Download,
  ImageUp,
} from "lucide-react";

export default function Editor() {
  const image = useEditor((s) => s.image);
  const [showHelp, setShowHelp] = useState(false);
  const [menu, setMenu] = useState<{ x: number; y: number; items: ContextMenuItem[] } | null>(
    null,
  );
  const autoRunning = useRef(false);

  const runAuto = useCallback(async () => {
    const st = useEditor.getState();
    if (!st.image || autoRunning.current) return;
    autoRunning.current = true;
    st.setError(null);
    st.setStatus("loading-model");
    st.setProgress(0, "Preparing model…");
    try {
      const mask = await autoMatte(st.image.imageData, (p, label) => {
        const cur = useEditor.getState();
        const lower = label.toLowerCase();
        if (lower.includes("removing") || lower.includes("finalizing"))
          cur.setStatus("processing");
        cur.setProgress(p, label);
      });
      useEditor.getState().setAutoMask(mask);
      useEditor.getState().setProgress(1, "Done");
    } catch (err) {
      useEditor.getState().setError(
        err instanceof Error ? err.message : "Background removal failed.",
      );
      useEditor.getState().setStatus("ready");
    } finally {
      autoRunning.current = false;
    }
  }, []);

  const detectRunning = useRef(false);

  const runDetect = useCallback(async () => {
    const st = useEditor.getState();
    if (!st.image || detectRunning.current) return;
    detectRunning.current = true;
    st.setError(null);
    st.clearDetections();
    st.setDetectStatus("detecting");
    st.setStatus("loading-model");
    st.setProgress(0, "Preparing detector…");
    try {
      const boxes = await detectObjects(st.image.imageData, (p, label) => {
        useEditor.getState().setProgress(p, label);
      });
      if (boxes.length === 0) {
        useEditor.getState().setError("No objects detected in this image.");
        useEditor.getState().setDetectStatus("idle");
      } else {
        useEditor.getState().setDetections(boxes);
      }
      useEditor.getState().setStatus("ready");
    } catch (err) {
      useEditor.getState().setError(
        err instanceof Error ? err.message : "Object detection failed.",
      );
      useEditor.getState().setDetectStatus("idle");
      useEditor.getState().setStatus("ready");
    } finally {
      detectRunning.current = false;
    }
  }, []);

  const runApplyDetections = useCallback(async () => {
    const st = useEditor.getState();
    const img = st.image;
    if (!img) return;
    const selected = st.detections.filter((d) => d.selected);
    if (selected.length === 0) return;

    st.setError(null);
    st.setDetectStatus("segmenting");
    st.setStatus("loading-model");
    st.setProgress(0, "Preparing segmentation model…");
    try {
      await samPrepare(img.imageData, (p, label) => {
        useEditor.getState().setProgress(p, label);
      });
      useEditor.getState().setProgress(0.95, `Segmenting ${selected.length} object(s)…`);
      useEditor.getState().setStatus("processing");
      const mask = await samSegment(selected, img.width, img.height);
      useEditor.getState().setAutoMask(mask);
      useEditor.getState().clearDetections();
      useEditor.getState().setProgress(1, "Done");
    } catch (err) {
      useEditor.getState().setError(
        err instanceof Error ? err.message : "Segmentation failed.",
      );
    } finally {
      useEditor.getState().setDetectStatus("idle");
      useEditor.getState().setStatus("ready");
    }
  }, []);

  const importFile = useCallback(
    async (file: File) => {
      const st = useEditor.getState();
      st.setError(null);
      try {
        const { bitmap, width, height } = await validateAndDecode(file);
        const imageData = bitmapToImageData(bitmap);
        bitmap.close();
        st.setImage({ imageData, width, height, name: file.name });
        // Easy mode: kick off AI removal immediately.
        void runAuto();
      } catch (err) {
        st.setError(err instanceof Error ? err.message : "Could not open this image.");
      }
    },
    [runAuto],
  );

  const openPicker = useCallback(() => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/png,image/jpeg,image/webp,image/gif,image/bmp";
    input.onchange = () => {
      const f = input.files?.[0];
      if (f) void importFile(f);
    };
    input.click();
  }, [importFile]);

  const openContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const st = useEditor.getState();
      const icon = (C: typeof Brush) => <C className="size-4" />;

      const items: ContextMenuItem[] = !st.image
        ? [{ key: "open", label: "Choose image…", icon: icon(ImageUp), onSelect: openPicker }]
        : [
            { key: "keep", label: "Keep brush", icon: icon(Brush), onSelect: () => st.setTool("keep") },
            { key: "remove", label: "Remove brush", icon: icon(Eraser), onSelect: () => st.setTool("remove") },
            { key: "wand", label: "Magic wand", icon: icon(Wand2), onSelect: () => st.setTool("wand") },
            { key: "lasso", label: "Lasso select", icon: icon(Lasso), onSelect: () => st.setTool("lasso") },
            { key: "pan", label: "Pan", icon: icon(Hand), onSelect: () => st.setTool("pan") },
            { key: "sep1", label: "", separator: true },
            {
              key: "undo",
              label: "Undo",
              icon: icon(Undo2),
              disabled: !st.canUndo(),
              onSelect: () => st.undo(),
            },
            {
              key: "redo",
              label: "Redo",
              icon: icon(Redo2),
              disabled: !st.canRedo(),
              onSelect: () => st.redo(),
            },
            {
              key: "invert",
              label: "Invert mask",
              icon: icon(FlipHorizontal2),
              onSelect: () => st.invert(),
            },
            { key: "sep2", label: "", separator: true },
            {
              key: "rerun",
              label: st.hasAuto ? "Re-run AI removal" : "Remove background (AI)",
              icon: icon(Sparkles),
              onSelect: () => void runAuto(),
            },
            {
              key: "detect",
              label: "Detect objects",
              icon: icon(ScanSearch),
              onSelect: () => void runDetect(),
            },
            {
              key: "download",
              label: "Download PNG",
              icon: icon(Download),
              disabled: !st.hasAuto && st.status !== "ready",
              onSelect: () => void downloadCurrent({ format: "png" }),
            },
            { key: "sep3", label: "", separator: true },
            {
              key: "replace",
              label: "Open a different image",
              icon: icon(ImageUp),
              onSelect: openPicker,
            },
          ];

      setMenu({ x: e.clientX, y: e.clientY, items });
    },
    [openPicker, runAuto, runDetect],
  );

  // paste-to-import
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const item = Array.from(e.clipboardData?.items ?? []).find((i) =>
        i.type.startsWith("image/"),
      );
      const f = item?.getAsFile();
      if (f) void importFile(f);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [importFile]);

  // keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable))
        return;
      const st = useEditor.getState();
      const meta = e.ctrlKey || e.metaKey;

      if (meta && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) st.redo();
        else st.undo();
        return;
      }
      if (meta && e.key.toLowerCase() === "y") {
        e.preventDefault();
        st.redo();
        return;
      }
      if (!st.image) return;
      switch (e.key) {
        case "k":
        case "K":
          st.setTool("keep");
          break;
        case "e":
        case "E":
          st.setTool("remove");
          break;
        case "w":
        case "W":
          st.setTool("wand");
          break;
        case "l":
        case "L":
          st.setTool("lasso");
          break;
        case "d":
        case "D":
          void runDetect();
          break;
        case "h":
        case "H":
          st.setTool("pan");
          break;
        case "[":
          st.setBrush({ size: Math.max(2, st.brush.size - 4) });
          break;
        case "]":
          st.setBrush({ size: Math.min(400, st.brush.size + 4) });
          break;
        case "i":
        case "I":
          st.invert();
          break;
        case "?":
          setShowHelp((v) => !v);
          break;
        case "Escape":
          setShowHelp(false);
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // release resources on unmount
  useEffect(() => {
    return () => {
      const bg = useEditor.getState().background;
      if (bg.kind === "image") bg.bitmap.close();
    };
  }, []);

  return (
    <div className="grid h-[calc(100vh-3.5rem)] grid-cols-1 bg-border md:grid-cols-[1fr_340px] md:gap-px">
      <div
        className="relative h-[46vh] min-h-[280px] md:h-full"
        onContextMenu={openContextMenu}
      >
        <CanvasStage onApplyDetections={runApplyDetections} />
        {!image && <Dropzone onFile={importFile} />}
      </div>

      <aside className="flex flex-col gap-5 overflow-y-auto bg-background p-4 pb-8">
        {image ? (
          <>
            <Toolbar onAuto={runAuto} onDetect={runDetect} onReplace={openPicker} />
            <Separator />
            <HistoryControls />
            <BrushControls />
            <SelectionControls />
            <Separator />
            <RefinePanel />
            <Separator />
            <BackgroundPanel />
            <Separator />
            <ExportBar />
            <Button variant="ghost" className="w-full" onClick={() => setShowHelp(true)}>
              <Keyboard /> Keyboard shortcuts
            </Button>
          </>
        ) : (
          <div>
            <h3 className="mb-2 text-sm font-semibold">Getting started</h3>
            <p className="text-sm text-muted-foreground">
              Drop or paste an image to begin. AI removal runs automatically, or use{" "}
              <strong>Detect objects</strong> to pick exactly which subjects to keep — then
              refine with the keep/remove brushes and edge tools.
            </p>
          </div>
        )}
      </aside>

      {showHelp && <Shortcuts onClose={() => setShowHelp(false)} />}
      {menu && (
        <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} />
      )}
    </div>
  );
}

function Shortcuts({ onClose }: { onClose: () => void }) {
  const rows: [string, string][] = [
    ["K", "Keep brush"],
    ["E", "Remove brush"],
    ["W", "Magic wand — click to auto-select by edge"],
    ["L", "Lasso — drag a freeform selection"],
    ["D", "Detect objects — click boxes to pick, then Apply"],
    ["H", "Pan tool"],
    ["Alt + click/drag", "Flip wand/lasso Remove ↔ Keep"],
    ["[  ]", "Brush size"],
    ["I", "Invert mask"],
    ["Ctrl/⌘ + Z", "Undo"],
    ["Ctrl/⌘ + Shift + Z", "Redo"],
    ["Scroll", "Zoom"],
    ["Space + drag", "Pan"],
    ["Right-click", "Open the app's action menu"],
    ["?", "Toggle this panel"],
  ];
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Keyboard shortcuts"
    >
      <div
        className="w-full max-w-md rounded-xl border bg-card p-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold">Keyboard shortcuts</h2>
        <table className="mt-4 w-full text-sm">
          <tbody>
            {rows.map(([k, d]) => (
              <tr key={k}>
                <td className="py-1.5 pr-4">
                  <kbd className="rounded border border-b-2 bg-muted px-1.5 py-0.5 font-mono text-xs">
                    {k}
                  </kbd>
                </td>
                <td className="py-1.5 text-muted-foreground">{d}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <Button variant="outline" className="mt-5 w-full" onClick={onClose}>
          Close
        </Button>
      </div>
    </div>
  );
}
