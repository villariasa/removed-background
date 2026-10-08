"use client";

import { useState } from "react";
import { downloadCurrent } from "@/lib/bg/download";
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
    setBusy(true);
    try {
      await downloadCurrent({ format, maxSize: size, trim });
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
