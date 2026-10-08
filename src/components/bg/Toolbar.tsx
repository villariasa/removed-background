"use client";

import { useEditor, type Tool } from "@/lib/bg/store";

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

  const tools: { id: Tool; label: string; title: string }[] = [
    { id: "keep", label: "Keep (K)", title: "Keep brush — paint areas to keep" },
    { id: "remove", label: "Remove (E)", title: "Remove brush — paint areas to exclude" },
    { id: "pan", label: "Pan (H)", title: "Pan / move the canvas" },
  ];

  return (
    <div className="panel">
      <h3>Tools</h3>
      <button
        className="btn primary"
        onClick={onAuto}
        disabled={busy}
        style={{ width: "100%", justifyContent: "center", marginBottom: "0.6rem" }}
      >
        {busy ? "Working…" : hasAuto ? "Re-run AI removal" : "✨ Remove background (AI)"}
      </button>
      <div className="seg" role="group" aria-label="Tool" style={{ width: "100%" }}>
        {tools.map((t) => (
          <button
            key={t.id}
            title={t.title}
            className={tool === t.id ? "active" : ""}
            onClick={() => setTool(t.id)}
            style={{ flex: 1 }}
          >
            {t.label}
          </button>
        ))}
      </div>
      <button
        className="btn"
        onClick={onReplace}
        style={{ width: "100%", justifyContent: "center", marginTop: "0.6rem" }}
      >
        Open a different image
      </button>
    </div>
  );
}
