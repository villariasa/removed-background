import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Developer — Remove Background",
  description: "How the in-browser background remover is built.",
};

export default function DeveloperPage() {
  return (
    <div className="page">
      <h1>Developer</h1>
      <p className="lead">Who built it and how it works under the hood.</p>

      <h2>What this is</h2>
      <p>
        A fully client-side background-removal tool: one-click AI removal plus a manual
        &ldquo;shade to keep / shade to remove&rdquo; brush for pixel-perfect correction.
        Everything — model inference, brushing, edge refinement, compositing, and export —
        runs in your browser. Your images never leave your device.
      </p>

      <h2>The pipeline</h2>
      <p>
        The whole editor revolves around <strong>one grayscale alpha mask</strong> kept at the
        image&rsquo;s native resolution (<code>0 = removed</code>, <code>255 = kept</code>).
        Every tool reads or writes this single mask, so the AI and the manual tools never
        fight — they just paint into the same buffer.
      </p>
      <ol>
        <li>
          <strong>Decode</strong> — the dropped image is validated (magic bytes, size and
          dimension caps) and decoded to an <code>ImageBitmap</code>.
        </li>
        <li>
          <strong>Auto matte</strong> — RMBG-1.4 runs in a Web Worker and writes an alpha
          matte into the mask.
        </li>
        <li>
          <strong>Manual brush</strong> — keep/remove brushes paint <code>255</code>/
          <code>0</code> into the mask with soft falloff, flow, and undo/redo.
        </li>
        <li>
          <strong>Edge refine</strong> — feather, grow/shrink, threshold, and spill-removal
          passes apply non-destructively over the mask.
        </li>
        <li>
          <strong>Composite &amp; export</strong> — <code>original × mask</code> over the
          chosen background, exported as transparent PNG or WebP.
        </li>
      </ol>

      <h2>Stack</h2>
      <table>
        <tbody>
          <tr>
            <th>Framework</th>
            <td>Next.js (App Router), client-only tool route</td>
          </tr>
          <tr>
            <th>Auto removal</th>
            <td>
              Transformers.js — <code>briaai/RMBG-1.4</code>, WebGPU-accelerated with a WASM
              fallback
            </td>
          </tr>
          <tr>
            <th>Canvas / brush</th>
            <td>Hand-rolled Canvas 2D stage with pan/zoom and soft brush stamping</td>
          </tr>
          <tr>
            <th>State / history</th>
            <td>Zustand with a mask-snapshot undo/redo stack</td>
          </tr>
          <tr>
            <th>Off-thread work</th>
            <td>Web Worker (model inference) with transferable buffers</td>
          </tr>
        </tbody>
      </table>

      <h2>Performance</h2>
      <ul>
        <li>WebGPU first, WASM fallback — feature-detected at model load.</li>
        <li>Inference runs at a capped working resolution (~1024px) and the matte is upscaled.</li>
        <li>Model weights download once and are cached by the runtime for instant repeat visits.</li>
        <li>Preview compositing is batched on <code>requestAnimationFrame</code>.</li>
      </ul>

      <p style={{ marginTop: "2rem" }}>
        <a href="/tools/background-remover" className="cta">
          Open the editor →
        </a>
      </p>
    </div>
  );
}
