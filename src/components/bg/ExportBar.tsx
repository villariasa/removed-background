"use client";

import { useState } from "react";
import { useEditor } from "@/lib/bg/store";
import { applyRefine, contentBounds } from "@/lib/bg/mask";
import { exportBlob, type Background } from "@/lib/bg/compositor";
import { sanitizeFilename } from "@/lib/bg/image";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { PanelTitle } from "./Field";
import { Download, Loader2 } from "lucide-react";

export default function ExportBar() {
  const [format, setFormat] = useState<"png" | "webp">("png");
  const [size, setSize] = useState<number>(0);
  const [trim, setTrim] = useState(false);
  const [busy, setBusy] = useState(false);

  async function download() {
    const st = useEditor.getState();
    const img = st.image;
    const base = st.baseMask;
    if (!img || !base) return;
    setBusy(true);
    try {
      const eff = applyRefine(base, img.width, img.height, st.refine);
      const blob = await exportBlob(
        {
          source: img.imageData,
          mask: eff,
          width: img.width,
          height: img.height,
          background: st.background as Background,
          spill: st.refine.spill,
        },
        {
          format,
          maxSize: size,
          trim,
          trimBounds: trim ? contentBounds(eff, img.width, img.height) : null,
        },
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${sanitizeFilename(img.name)}-cutout.${format}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <PanelTitle>Export</PanelTitle>
      <div className="space-y-3">
        <div>
          <div className="mb-1.5 text-xs text-muted-foreground">Format</div>
          <ToggleGroup
            type="single"
            variant="outline"
            value={format}
            onValueChange={(v) => v && setFormat(v as "png" | "webp")}
            className="w-full"
          >
            <ToggleGroupItem value="png" size="sm">PNG</ToggleGroupItem>
            <ToggleGroupItem value="webp" size="sm">WebP</ToggleGroupItem>
          </ToggleGroup>
        </div>

        <div>
          <div className="mb-1.5 text-xs text-muted-foreground">Size</div>
          <ToggleGroup
            type="single"
            variant="outline"
            value={String(size)}
            onValueChange={(v) => v && setSize(Number(v))}
            className="w-full"
          >
            <ToggleGroupItem value="0" size="sm">Original</ToggleGroupItem>
            <ToggleGroupItem value="2048" size="sm">2048</ToggleGroupItem>
            <ToggleGroupItem value="1024" size="sm">1024</ToggleGroupItem>
          </ToggleGroup>
        </div>

        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={trim}
            onChange={(e) => setTrim(e.target.checked)}
            className="size-4 accent-primary"
          />
          Trim to content
        </label>

        <Button className="w-full" onClick={download} disabled={busy}>
          {busy ? <Loader2 className="animate-spin" /> : <Download />}
          {busy ? "Exporting…" : `Download ${format.toUpperCase()}`}
        </Button>
      </div>
    </section>
  );
}
