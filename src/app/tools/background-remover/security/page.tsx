import type { Metadata } from "next";
import { Card, CardContent } from "@/components/ui/card";
import { ShieldCheck } from "lucide-react";

export const metadata: Metadata = {
  title: "Security — Remove Background",
  description: "Privacy and security statement for the in-browser background remover.",
};

function Code({ children }: { children: string }) {
  return (
    <pre className="mt-3 overflow-x-auto rounded-lg bg-foreground p-4 text-[0.82rem] leading-relaxed text-background">
      <code>{children}</code>
    </pre>
  );
}

const ic = "rounded bg-muted px-1 py-0.5 text-[0.85em] font-mono";

export default function SecurityPage() {
  return (
    <div className="mx-auto max-w-3xl px-5 py-12 pb-24">
      <h1 className="text-3xl font-semibold tracking-tight">Security &amp; Privacy</h1>
      <p className="mt-2 text-lg text-muted-foreground">
        The core promise: by default, your images never leave your device.
      </p>

      <Card className="mt-6 border-l-4 border-l-green-600 py-4">
        <CardContent className="flex gap-3">
          <ShieldCheck className="mt-0.5 size-5 shrink-0 text-green-600" />
          <p>
            <strong>No upload.</strong> Auto removal, brushing, refinement, and export all run
            locally in your browser (WebGPU/WASM in a Web Worker). Verify it in your
            browser&rsquo;s Network panel — no image bytes are sent anywhere.
          </p>
        </CardContent>
      </Card>

      <section className="mt-8">
        <h2 className="border-b pb-2 text-xl font-semibold">Privacy &amp; data handling</h2>
        <ul className="mt-3 list-disc space-y-1.5 pl-5 text-muted-foreground">
          <li>
            <strong className="text-foreground">In-memory only.</strong> Images live in memory;
            nothing is persisted except model weights (weights only, never your images).
          </li>
          <li>
            <strong className="text-foreground">No content telemetry.</strong> No image data is
            ever logged or transmitted.
          </li>
          <li>
            <strong className="text-foreground">EXIF/GPS stripped.</strong> Exports are
            re-encoded through a clean canvas, removing metadata including location.
          </li>
        </ul>
      </section>

      <section className="mt-8">
        <h2 className="border-b pb-2 text-xl font-semibold">Browser hardening</h2>
        <p className="mt-3 text-muted-foreground">The tool routes ship a strict security header set:</p>
        <Code>{`Content-Security-Policy:
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
Permissions-Policy: camera=(), microphone=(), geolocation=()`}</Code>
        <p className="mt-3 leading-relaxed text-muted-foreground">
          When weights are self-hosted, the <code className={ic}>connect-src</code> remote hosts
          can be dropped for a fully same-origin policy.
        </p>
      </section>

      <section className="mt-8">
        <h2 className="border-b pb-2 text-xl font-semibold">Input validation</h2>
        <ul className="mt-3 list-disc space-y-1.5 pl-5 text-muted-foreground">
          <li>
            <strong className="text-foreground">Type</strong> — verified by <em>magic bytes</em>,
            not the extension (PNG, JPEG, WebP, GIF, BMP).
          </li>
          <li>
            <strong className="text-foreground">Size / dimensions</strong> — ~15 MB byte cap and
            a ~40-megapixel ceiling reject decompression bombs before decode.
          </li>
          <li>
            <strong className="text-foreground">Safe decode</strong> — failures surface a
            friendly error instead of crashing.
          </li>
          <li>
            <strong className="text-foreground">Filename sanitization</strong> — the export
            filename is stripped of path separators and control/HTML characters.
          </li>
        </ul>
      </section>

      <section className="mt-8">
        <h2 className="border-b pb-2 text-xl font-semibold">Execution sandboxing</h2>
        <p className="mt-3 leading-relaxed text-muted-foreground">
          Inference runs in a Web Worker isolated from the DOM; only structured data crosses the
          boundary. There is no <code className={ic}>eval</code> of user content — WASM is the
          only non-JS execution and it is CSP-gated by{" "}
          <code className={ic}>&apos;wasm-unsafe-eval&apos;</code>.
        </p>
      </section>

      <section className="mt-8">
        <h2 className="border-b pb-2 text-xl font-semibold">Ship checklist</h2>
        <ul className="mt-3 space-y-1.5 text-muted-foreground">
          {[
            "No image bytes leave the device on the default path (verified in Network panel).",
            "CSP + COOP/COEP + security headers live on all tool routes.",
            "File type verified by magic bytes; size/dimension caps enforced; bombs rejected.",
            "Export filename sanitized; EXIF stripped.",
            "Dependencies pinned; lockfile committed; npm audit reviewed.",
          ].map((t) => (
            <li key={t} className="flex gap-2">
              <span className="text-green-600">✓</span>
              {t}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
