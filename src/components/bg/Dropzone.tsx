"use client";

import { useRef, useState } from "react";
import { useEditor } from "@/lib/bg/store";

export default function Dropzone({ onFile }: { onFile: (file: File) => void }) {
  const [over, setOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const error = useEditor((s) => s.error);

  return (
    <div
      className={`dropzone${over ? " over" : ""}`}
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
      <div style={{ fontSize: "3rem" }} aria-hidden>
        🖼️
      </div>
      <h2>Drop an image to remove its background</h2>
      <p>
        Drag &amp; drop, paste from clipboard, or choose a file. PNG, JPEG, WebP, GIF, or BMP,
        up to 15 MB.
        <br />
        Everything runs in your browser — nothing is uploaded.
      </p>
      <button className="cta" onClick={() => inputRef.current?.click()}>
        Choose image
      </button>
      {error && (
        <div className="errbox" role="alert" style={{ marginTop: "0.5rem" }}>
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
