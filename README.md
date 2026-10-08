# Remove Background

A fast, private, in-browser AI background removal tool. 100% client-side with manual refinement — no uploads, no server.

> **Status:** Implemented (Phases 1–3). One-click AI removal, manual keep/remove brush,
> edge refinement, background options, and export all work in-browser. The full technical
> spec lives in **[`BACKGROUND_REMOVER_PLAN.md`](./BACKGROUND_REMOVER_PLAN.md)**.

---

## Run it

```bash
npm install --no-bin-links   # --no-bin-links only needed on filesystems without symlinks
npm run dev                  # http://localhost:3000/tools/background-remover
# or: node node_modules/next/dist/bin/next dev   (if bin symlinks weren't created)
```

The first background removal downloads the RMBG-1.4 weights (~44 MB, quantized) from the
HuggingFace Hub once, then caches them for instant repeat use. "Detect objects" downloads two
more small models on first use (YOLOS-tiny ~10 MB, SlimSAM ~14 MB). The optional "Identify
unclear objects" button downloads a third, much larger model (CLIP, ~150 MB) — it's opt-in
and only needed if the detector's 91 known categories miss something. Nothing else leaves
your device.

## Project layout

```
src/app/tools/background-remover/   # routes: editor + developer / api / security pages
src/components/bg/                  # Editor, CanvasStage, Toolbar, panels, ToolNav
src/components/ui/                  # shadcn/ui primitives (new-york, neutral, clean white)
src/lib/bg/                         # mask ops, compositor, image validation, Zustand store
src/lib/bg/worker/                  # ML worker (Transformers.js + RMBG-1.4) + RPC client
```

## Implementation notes

- **UI:** shadcn/ui + Tailwind CSS v4 (clean white, formal aesthetic).
- **Canvas:** a hand-rolled Canvas 2D stage (pan/zoom, soft brush stamping) rather than Konva —
  fewer dependencies and full control of the compositing hot path; can graduate to WebGL later.
- **Object detection:** YOLOS-tiny finds distinct objects; selected boxes are segmented by
  SlimSAM using a **point prompt** at each box's center (the published ONNX decoder graph
  only exposes point/label inputs — `input_boxes` is accepted by the JS API but silently
  dropped by the session, so true box-conditioned segmentation isn't actually available with
  this export). Detector output gets greedy NMS (IoU > 0.5) since `post_process_object_detection`
  does no deduplication — without it, overlapping duplicate boxes make some unclickable.
- **"Identify unclear objects" (CLIP zero-shot) is a soft hint, not a fix** — confirmed by
  testing on a real photo: CLIP correctly says "table lamp" on the *whole* image, but once
  cropped down to just the detected box (the only way to name *that specific object*), it
  agreed with the detector's wrong "vase" guess on 2 of 3 boxes, even with 40% padding added.
  Cropping removes the scene context CLIP actually relies on. So it's opt-in, only shown as
  "possibly: X" when it both disagrees with the detector and clears a confidence floor, and
  it never replaces the primary label. It's right some of the time, not reliably better.
- **WASM is pinned to single-threaded** (`numThreads = 1`) deliberately: threaded WASM needs
  `SharedArrayBuffer`, which requires `COOP`+`COEP` headers, and enabling `COEP` makes
  onnxruntime-web opt into a pthread codepath that throws under this project's CSP. No COEP
  header is sent at all.
- **Not yet built:** edge-aware "magnetic" brush, BiRefNet upgrade, true box/multi-point SAM
  prompting (would need a different SAM ONNX export). The single-mask architecture leaves
  room to drop these in.
- **`npm audit`:** the remaining advisories are **Node-only** transitive deps of
  Transformers.js (`sharp`, `onnxruntime-node`, `global-agent`) that are never bundled into the
  browser (the client uses `onnxruntime-web`), plus a build-time-only postcss advisory inside
  Next. None affect the shipped client runtime.

---

## What it does

- **Easy mode** — drop an image, AI removes the background in seconds.
- **Detect objects** — find distinct subjects (YOLOS), click boxes to pick which to keep,
  Apply to segment just those (SlimSAM) and replace the mask.
- **Advanced mode** — refine the result:
  - **Brush** areas to keep or exclude (soft brush, size/feather/flow, undo/redo).
  - **Magic wand** — click a region to select by color similarity, snapping to edges.
  - **Lasso** — drag a freeform outline to select any shape.
  - Tune **edges** (feather, smooth, grow/shrink, color de-fringe).
  - Choose a **background**: transparent / solid color / image / blurred original.
- **Export** transparent PNG or WebP, with trim-to-content and size presets.
- **Right-click** the canvas for a context menu of quick actions.

**Core promise:** by default, images never leave your device — everything runs in the browser.

## Stack

| Concern | Choice |
|---|---|
| Framework | Next.js (App Router), static export, client-only tool route |
| Auto removal | Transformers.js — RMBG-1.4, WebGPU accelerated (q8 quantized on CPU/WASM) |
| Object detection | Transformers.js — YOLOS-tiny, with NMS dedup |
| Pick-to-segment | Transformers.js — SlimSAM (point-prompted at each box's center) |
| Canvas / brush | Hand-rolled Canvas 2D (pan/zoom, brush/wand/lasso, detection overlay) |
| State / history | Zustand |
| Off-thread work | A single Web Worker (plain `postMessage` RPC) |

See plan §2 for rationale and alternatives (incl. an optional server path).

## Pages

| Nav | Route | Purpose |
|---|---|---|
| **Remove Background** | `/tools/background-remover` | The editor (main tool) |
| **Developer** | `…/developer` | How it's built + about |
| **API Guide** | `…/api` | Client + optional server API docs |
| **Security** | `…/security` | Privacy & security statement |

## Security

Images never leave the device on the default path. Hardened with CSP (no `COEP` — WASM is
pinned single-threaded, so cross-origin isolation is never needed) + `COOP: same-origin`,
strict input validation (magic-byte checks, size/dimension caps, bomb rejection), filename
sanitization, EXIF stripping, and Worker sandboxing.
Full detail + ship-gate checklist in plan §12.

## Roadmap

`Phase 0` spike → `1` MVP auto-removal → `2` manual brush → `3` edge refine →
`4` click-to-select → `5` polish. See plan §8.

## Documentation

- **[`BACKGROUND_REMOVER_PLAN.md`](./BACKGROUND_REMOVER_PLAN.md)** — architecture, features,
  mask pipeline, performance, API & access guide, navigation/IA, and security.
