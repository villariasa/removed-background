"use client";

import { useRef, useState } from "react";
import { useEditor } from "@/lib/bg/store";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ImageDown, Upload } from "lucide-react";

export default function Dropzone({ onFile }: { onFile: (file: File) => void }) {
  const [over, setOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const error = useEditor((s) => s.error);

  return (
    <div
      className={cn(
        "absolute inset-0 flex flex-col items-center justify-center gap-4 p-8 text-center transition-colors",
        over && "bg-primary/5 outline-2 -outline-offset-16 outline-dashed outline-primary",
      )}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const f = e.dataTransfer.files?.[0];
        if (f) onFile(f);
      }}
    >
      <div className="flex size-16 items-center justify-center rounded-2xl bg-secondary text-secondary-foreground">
        <ImageDown className="size-8" />
      </div>
      <h2 className="text-xl font-semibold tracking-tight text-foreground">
        Drop an image to remove its background
      </h2>
      <p className="max-w-md text-sm text-muted-foreground">
        Drag &amp; drop, paste from clipboard, or choose a file. PNG, JPEG, WebP, GIF, or BMP,
        up to 15 MB. Everything runs in your browser — nothing is uploaded.
      </p>
      <Button size="lg" onClick={() => inputRef.current?.click()}>
        <Upload /> Choose image
      </Button>
      {error && (
        <div
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {error}
        </div>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif,image/bmp"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.target.value = "";
        }}
      />
    </div>
  );
}
