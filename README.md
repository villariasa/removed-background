# Remove Background

A fast, **private**, in-browser background-removal tool. One-click AI removal **plus** manual
"shade to keep / shade to remove" refinement — no account, no upload, no server.

> **Status:** Planning. The full technical spec lives in
> **[`BACKGROUND_REMOVER_PLAN.md`](./BACKGROUND_REMOVER_PLAN.md)** — read it before writing code.

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
