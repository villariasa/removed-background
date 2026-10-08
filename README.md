# Remove Background

A fast, **private**, 100% in-browser AI background removal tool. One-click AI removal **plus** manual refinement ("shade to keep / shade to remove" brush, edge tuning, and smart point selection) — no account, zero uploads, runs entirely on your device.

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

The first background removal downloads the RMBG-1.4 weights (~44 MB) from the HuggingFace
Hub once, then caches them for instant repeat use. Nothing else leaves your device.

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
- **Not yet built (Phase 4+):** MobileSAM click-to-select, edge-aware "magnetic" brush,
  BiRefNet upgrade. The single-mask architecture leaves room to drop these in.
- **`npm audit`:** the remaining advisories are **Node-only** transitive deps of
  Transformers.js (`sharp`, `onnxruntime-node`, `global-agent`) that are never bundled into the
  browser (the client uses `onnxruntime-web`), plus a build-time-only postcss advisory inside
  Next. None affect the shipped client runtime.

---

## What it does

- **Easy mode** — drop an image, AI removes the background in seconds.
- **Advanced mode** — refine the result:
  - **Brush** areas to keep or exclude (soft brush, size/feather/flow, undo/redo).
  - **Click** a subject to auto-select it (point-prompt AI).
  - Tune **edges** (feather, smooth, grow/shrink, color de-fringe).
  - Choose a **background**: transparent / solid color / image / blurred original.
- **Export** transparent PNG or WebP, with trim-to-content and size presets.

**Core promise:** by default, images never leave your device — everything runs in the browser.

## Stack

| Concern | Choice |
|---|---|
| Framework | Next.js (App Router), client-only tool route |
| Auto removal | Transformers.js — RMBG-1.4 (→ BiRefNet), **WebGPU** accelerated |
| Click-to-select | MobileSAM via `onnxruntime-web` |
| Canvas / brush | Konva + react-konva |
| State / history | Zustand |
| Off-thread work | Web Worker + Comlink |
| Fast MVP shortcut | `@imgly/background-removal` |

See plan §2 for rationale and alternatives (incl. an optional server path).

## Pages

| Nav | Route | Purpose |
|---|---|---|
| **Remove Background** | `/tools/background-remover` | The editor (main tool) |
| **Developer** | `…/developer` | How it's built + about |
| **API Guide** | `…/api` | Client + optional server API docs |
| **Security** | `…/security` | Privacy & security statement |

## Security

Images never leave the device on the default path. Hardened with CSP + COOP/COEP, strict input
validation (magic-byte checks, size/dimension caps, bomb rejection), filename sanitization, EXIF
stripping, self-hosted models with integrity hashes, and Worker sandboxing.
Full detail + ship-gate checklist in plan §12.

## Roadmap

`Phase 0` spike → `1` MVP auto-removal → `2` manual brush → `3` edge refine →
`4` click-to-select → `5` polish. See plan §8.

## Documentation

- **[`BACKGROUND_REMOVER_PLAN.md`](./BACKGROUND_REMOVER_PLAN.md)** — architecture, features,
  mask pipeline, performance, API & access guide, navigation/IA, and security.
