"use client";

import { useRef } from "react";
import { useEditor } from "@/lib/bg/store";
import { validateAndDecode } from "@/lib/bg/image";

const COLORS = ["#ffffff", "#000000", "#2563eb", "#16a34a", "#dc2626", "#f59e0b", "#e879f9"];

export default function BackgroundPanel() {
  const background = useEditor((s) => s.background);
  const setBackground = useEditor((s) => s.setBackground);
  const setError = useEditor((s) => s.setError);
  const fileRef = useRef<HTMLInputElement>(null);

  const kind = background.kind;

  return (
    <div className="panel">
      <h3>Background</h3>
      <div className="seg" role="group" aria-label="Background" style={{ width: "100%", flexWrap: "wrap" }}>
        <button
          className={kind === "transparent" ? "active" : ""}
          onClick={() => setBackground({ kind: "transparent" })}
          style={{ flex: 1 }}
        >
          None
        </button>
        <button
          className={kind === "color" ? "active" : ""}
          onClick={() => setBackground({ kind: "color", color: "#ffffff" })}
          style={{ flex: 1 }}
        >
          Color
        </button>
        <button
          className={kind === "image" ? "active" : ""}
          onClick={() => fileRef.current?.click()}
          style={{ flex: 1 }}
        >
          Image
        </button>
        <button
          className={kind === "blur" ? "active" : ""}
          onClick={() => setBackground({ kind: "blur", radius: 12 })}
          style={{ flex: 1 }}
        >
          Blur
        </button>
      </div>

      {background.kind === "color" && (
        <div style={{ marginTop: "0.7rem" }}>
          <div className="swatches">
            {COLORS.map((c) => (
              <button
                key={c}
                className={`swatch${background.color === c ? " active" : ""}`}
                style={{ background: c }}
                aria-label={c}
                onClick={() => setBackground({ kind: "color", color: c })}
              />
            ))}
            <input
              type="color"
              value={background.color}
              onChange={(e) => setBackground({ kind: "color", color: e.target.value })}
              style={{ width: 26, height: 26, padding: 0, border: "none", background: "none" }}
            />
          </div>
        </div>
      )}

      {background.kind === "blur" && (
        <div className="field" style={{ marginTop: "0.7rem" }}>
          <label>
            <span>Blur amount</span>
            <span className="val">{background.radius}px</span>
          </label>
          <input
            type="range"
            min={2}
            max={40}
            step={1}
            value={background.radius}
            onChange={(e) => setBackground({ kind: "blur", radius: Number(e.target.value) })}
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
    </div>
  );
}
