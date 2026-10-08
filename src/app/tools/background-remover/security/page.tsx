import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Security — Remove Background",
  description: "Privacy and security statement for the in-browser background remover.",
};

export default function SecurityPage() {
  return (
    <div className="page">
      <h1>Security &amp; Privacy</h1>
      <p className="lead">
        The core promise: by default, your images never leave your device.
      </p>

      <div className="callout good">
        <strong>No upload.</strong> Auto removal, brushing, refinement, and export all run
        locally in your browser (WebGPU/WASM in a Web Worker). You can verify this in your
        browser&rsquo;s Network panel — no image bytes are sent anywhere.
      </div>

      <h2>Privacy &amp; data handling</h2>
      <ul>
        <li>
          <strong>In-memory only.</strong> Images live in memory as <code>ImageBitmap</code>/
          <code>ImageData</code>; nothing is persisted except model weights (cached by the
          runtime — weights only, never your images).
        </li>
        <li>
          <strong>No content telemetry.</strong> No image data is ever logged or transmitted.
        </li>
        <li>
          <strong>EXIF/GPS stripped.</strong> Exports are re-encoded through a clean canvas, so
          metadata (including location) is removed.
        </li>
      </ul>

      <h2>Browser hardening</h2>
      <p>The tool routes ship a strict security header set:</p>
      <pre>
        <code>{`Content-Security-Policy:
  default-src 'self';
  script-src 'self' 'wasm-unsafe-eval';
  worker-src 'self' blob:;
  img-src 'self' blob: data:;
  style-src 'self' 'unsafe-inline';
  connect-src 'self' https://huggingface.co https://cdn.jsdelivr.net;
  object-src 'none'; base-uri 'self'; frame-ancestors 'none';
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: credentialless
Referrer-Policy: no-referrer
X-Content-Type-Options: nosniff
Permissions-Policy: camera=(), microphone=(), geolocation=()`}</code>
      </pre>
      <p>
        When weights are self-hosted, the <code>connect-src</code> remote hosts can be dropped
        entirely for a fully same-origin policy.
      </p>

      <h2>Input validation</h2>
      <ul>
        <li>
          <strong>Type</strong> — files are verified by <em>magic bytes</em>, not the extension
          (PNG, JPEG, WebP, GIF, BMP).
        </li>
        <li>
          <strong>Size / dimensions</strong> — byte cap (~15 MB) and a ~40-megapixel ceiling
          reject decompression bombs before decode.
        </li>
        <li>
          <strong>Safe decode</strong> — decoding failures surface a friendly error instead of
          crashing.
        </li>
        <li>
          <strong>Filename sanitization</strong> — the export filename is stripped of path
          separators and control/HTML characters.
        </li>
      </ul>

      <h2>Execution sandboxing</h2>
      <p>
        Inference runs in a Web Worker isolated from the DOM; only structured data crosses the
        boundary. There is no <code>eval</code> of user content — WASM is the only non-JS
        execution and it is CSP-gated by <code>&apos;wasm-unsafe-eval&apos;</code>.
      </p>

      <h2>Ship checklist</h2>
      <ul>
        <li>No image bytes leave the device on the default path (verified in Network panel).</li>
        <li>CSP + COOP/COEP + security headers live on all tool routes.</li>
        <li>File type verified by magic bytes; size/dimension caps enforced; bombs rejected.</li>
        <li>Export filename sanitized; EXIF stripped.</li>
        <li>Dependencies pinned; lockfile committed; <code>npm audit</code> clean.</li>
      </ul>
    </div>
  );
}
