import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Developer — Remove Background",
  description: "How the in-browser background remover is built.",
};

const STACK: [string, React.ReactNode][] = [
  ["Framework", "Next.js (App Router), client-only tool route"],
  [
    "Auto removal",
    <>
      Transformers.js — <code className="rounded bg-muted px-1 py-0.5 text-[0.85em]">briaai/RMBG-1.4</code>, WebGPU-accelerated with WASM fallback
    </>,
  ],
  ["Canvas / brush", "Hand-rolled Canvas 2D stage with pan/zoom and soft brush stamping"],
  ["State / history", "Zustand with a mask-snapshot undo/redo stack"],
  ["Off-thread work", "Web Worker (model inference) with transferable buffers"],
];

export default function DeveloperPage() {
  return (
    <div className="mx-auto max-w-3xl px-5 py-12 pb-24">
      <h1 className="text-3xl font-semibold tracking-tight">Developer</h1>
      <p className="mt-2 text-lg text-muted-foreground">
        Who built it and how it works under the hood.
      </p>

      <section className="mt-10">
        <h2 className="border-b pb-2 text-xl font-semibold">What this is</h2>
        <p className="mt-3 leading-relaxed text-muted-foreground">
          A fully client-side background-removal tool: one-click AI removal plus a manual
          &ldquo;shade to keep / shade to remove&rdquo; brush for pixel-perfect correction.
          Everything — model inference, brushing, edge refinement, compositing, and export —
          runs in your browser. Your images never leave your device.
        </p>
      </section>

      <section className="mt-8">
        <h2 className="border-b pb-2 text-xl font-semibold">The pipeline</h2>
        <p className="mt-3 leading-relaxed text-muted-foreground">
          The whole editor revolves around <strong className="text-foreground">one grayscale
          alpha mask</strong> kept at the image&rsquo;s native resolution (0 = removed, 255 =
          kept). Every tool reads or writes this single mask, so the AI and the manual tools
          never fight — they just paint into the same buffer.
        </p>
        <ol className="mt-4 space-y-2 text-muted-foreground">
          {[
            ["Decode", "the dropped image is validated (magic bytes, size/dimension caps) and decoded to an ImageBitmap."],
            ["Auto matte", "RMBG-1.4 runs in a Web Worker and writes an alpha matte into the mask."],
            ["Manual brush", "keep/remove brushes paint 255/0 into the mask with soft falloff, flow, and undo/redo."],
            ["Edge refine", "feather, grow/shrink, threshold, and spill-removal passes apply non-destructively."],
            ["Composite & export", "original × mask over the chosen background, exported as transparent PNG or WebP."],
          ].map(([t, d], i) => (
            <li key={t} className="flex gap-3">
              <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-secondary-foreground">
                {i + 1}
              </span>
              <span>
                <strong className="text-foreground">{t}</strong> — {d}
              </span>
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-8">
        <h2 className="border-b pb-2 text-xl font-semibold">Stack</h2>
        <Card className="mt-4 py-0">
          <CardContent className="px-0">
            <dl className="divide-y">
              {STACK.map(([k, v]) => (
                <div key={k} className="grid grid-cols-1 gap-1 px-5 py-3 sm:grid-cols-[180px_1fr]">
                  <dt className="text-sm font-medium text-muted-foreground">{k}</dt>
                  <dd className="text-sm">{v}</dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>
      </section>

      <section className="mt-8">
        <h2 className="border-b pb-2 text-xl font-semibold">Performance</h2>
        <ul className="mt-3 list-disc space-y-1.5 pl-5 text-muted-foreground">
          <li>WebGPU first, WASM fallback — feature-detected at model load.</li>
          <li>Inference runs at a capped working resolution (~1024px); the matte is upscaled.</li>
          <li>Model weights download once and are cached for instant repeat visits.</li>
          <li>Preview compositing is batched on requestAnimationFrame.</li>
        </ul>
      </section>

      <div className="mt-10">
        <Button asChild size="lg">
          <Link href="/tools/background-remover">Open the editor →</Link>
        </Button>
      </div>
    </div>
  );
}
