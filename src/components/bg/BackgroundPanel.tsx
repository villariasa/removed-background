"use client";

import { useRef } from "react";
import { useEditor } from "@/lib/bg/store";
import { validateAndDecode } from "@/lib/bg/image";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { SliderField, PanelTitle } from "./Field";
import { cn } from "@/lib/utils";

const COLORS = ["#ffffff", "#000000", "#2563eb", "#16a34a", "#dc2626", "#f59e0b", "#e879f9"];

export default function BackgroundPanel() {
  const background = useEditor((s) => s.background);
  const setBackground = useEditor((s) => s.setBackground);
  const setError = useEditor((s) => s.setError);
  const fileRef = useRef<HTMLInputElement>(null);
  const kind = background.kind;

  return (
    <section>
      <PanelTitle>Background</PanelTitle>
      <ToggleGroup
        type="single"
        variant="outline"
        value={kind}
        onValueChange={(v) => {
          if (!v) return;
          if (v === "transparent") setBackground({ kind: "transparent" });
          else if (v === "color") setBackground({ kind: "color", color: "#ffffff" });
          else if (v === "blur") setBackground({ kind: "blur", radius: 12 });
          else if (v === "image") fileRef.current?.click();
        }}
        className="w-full"
      >
        <ToggleGroupItem value="transparent" size="sm">None</ToggleGroupItem>
        <ToggleGroupItem value="color" size="sm">Color</ToggleGroupItem>
        <ToggleGroupItem value="image" size="sm">Image</ToggleGroupItem>
        <ToggleGroupItem value="blur" size="sm">Blur</ToggleGroupItem>
      </ToggleGroup>

      {background.kind === "color" && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {COLORS.map((c) => (
            <button
              key={c}
              className={cn(
                "size-6 rounded-md border",
                background.color === c && "ring-2 ring-ring ring-offset-1",
              )}
              style={{ background: c }}
              aria-label={c}
              onClick={() => setBackground({ kind: "color", color: c })}
            />
          ))}
          <input
            type="color"
            value={background.color}
            onChange={(e) => setBackground({ kind: "color", color: e.target.value })}
            className="size-6 cursor-pointer rounded-md border bg-transparent p-0"
            aria-label="Custom color"
          />
        </div>
      )}

      {background.kind === "blur" && (
        <div className="mt-3">
          <SliderField
            label="Blur amount"
            value={background.radius}
            min={2}
            max={40}
            suffix="px"
            onChange={(v) => setBackground({ kind: "blur", radius: v })}
          />
        </div>
      )}

      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        hidden
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f) return;
          try {
            const { bitmap } = await validateAndDecode(f);
            setBackground({ kind: "image", bitmap });
          } catch (err) {
            setError(err instanceof Error ? err.message : "Could not load backdrop.");
          }
        }}
      />
    </section>
  );
}
