# Background Remover — Technical Plan

> A fast, private, in-browser background-removal tool with one-click AI removal **and**
> manual "shade to keep / shade to remove" refinement.
> Target: ship as a page inside this Next.js app (`/tools/background-remover`), fully client-side.
>
> Last updated: 2026-10-08

---

## 1. Goal

Let a user drop in a photo and get a clean cut-out in seconds, then **manually correct** it
by painting over the parts to keep or exclude — no Photoshop, no account, no upload.

Two layers of capability:

1. **Easy mode** — click once, AI removes the background. Done.
2. **Advanced mode** — refine the AI result (or start from scratch) by:
   - **Shading/brushing** areas to keep or remove (the core request),
   - **Clicking** a subject to auto-select it (point-prompt AI),
   - Tuning the **edges** (feather, smoothing, color de-fringe),
   - Choosing a **new background** (transparent / color / image / blurred original).

**Design principle:** everything runs **in the browser**. The image never leaves the device.
This is the single biggest decision and it drives the whole stack below.

---

## 2. Recommended stack ("best framework for fast")

| Concern | Recommendation | Why |
|---|---|---|
| App framework | **Next.js 16 (App Router)** — already in this repo | Reuse tooling; tool lives at `/tools/background-remover` as a **client-only** route (`dynamic(() => …, { ssr: false })`) so the ~15–40 MB of model/runtime never touches SSR. |
| Auto removal model | **Transformers.js v3** (`@huggingface/transformers`) running **RMBG-1.4** (`briaai/RMBG-1.4`); upgrade path to **BiRefNet** for best edges | Pure JS/WASM/WebGPU, no server. RMBG-1.4 is the current sweet spot for speed+quality. |
| GPU acceleration | **WebGPU backend** with **WASM (SIMD + threads) fallback** | WebGPU is 5–20× faster than WASM for these models on supported browsers. |
| Click-to-select ("advanced, easy") | **MobileSAM / SAM** via **onnxruntime-web** (encoder once, tiny decoder per click) | Lets the user *click the subject* and get an instant mask; positive/negative points. |
| Interactive canvas + brush | **Konva + react-konva** (layered canvas) for MVP; **PixiJS/WebGL** compositor if large images get slow | Konva gives pan/zoom, layers, and pointer events cheaply; swap the compositing hot path to WebGL later. |
| Heavy work off the main thread | **Web Worker** wrapped with **Comlink** | Keeps the UI at 60fps while the model and large-image ops run. |
| State + history | **Zustand** (+ a small undo/redo stack) | Minimal, fast, easy to snapshot the mask for undo. |
| Large-image ops | **OffscreenCanvas** + **ImageBitmap** | Decode/resize/composite without blocking; tile very large images. |

### Fast zero-config alternative
If you want a shortcut for the *auto* step only: **`@imgly/background-removal`** (IMG.LY) is a
drop-in, batteries-included WASM/WebGPU library (`removeBackground(blob)` → cut-out blob). Use it
to ship the MVP in a day, then graduate to Transformers.js when you need control over the raw mask
for the manual tools. (The manual brush + SAM pieces are ours either way.)

### Server-side alternative (documented, not recommended here)
If you ever need heavier models or must support ancient browsers: a tiny **FastAPI** service
running **`rembg`** (U²-Net / BiRefNet) on Vercel Fluid Compute or a GPU box. Trade-offs: upload
latency, privacy, and per-request cost. Keep the same client UI; just swap the "auto" call for a
`fetch`. **Default plan stays 100% client-side.**

---

## 3. Core architecture — the alpha-mask pipeline

Everything revolves around **one grayscale alpha mask** (`Uint8ClampedArray`, 1 byte/px,
`0 = fully removed`, `255 = fully kept`) kept at the image's native resolution. Every tool reads
or writes this mask; the preview is just `originalRGB × mask` composited live.

```
          ┌─────────────┐
 upload → │ ImageBitmap │ (decoded off-thread)
          └──────┬──────┘
                 │
        ┌────────▼─────────┐     writes       ┌──────────────┐
        │  AI auto-matte   │ ───────────────► │              │
        │  (RMBG / BiRefNet)│                  │  ALPHA MASK  │
        └──────────────────┘                  │  (Uint8, HxW)│
        ┌──────────────────┐     writes       │              │
        │  SAM click-select │ ───────────────►│  ← single    │
        └──────────────────┘                  │    source of │
        ┌──────────────────┐  read+write      │    truth     │
        │  Brush keep/erase │◄────────────────┤              │
        └──────────────────┘                  └──────┬───────┘
        ┌──────────────────┐     reads               │
        │  Edge refine      │◄───────────────────────┘
        │ (feather/smooth/  │                         │
        │  defringe)        │                         ▼
        └──────────────────┘              ┌────────────────────────┐
                                          │  Live compositor        │
                                          │  (WebGL/Canvas):         │
                                          │  out.rgb = img.rgb       │
                                          │  out.a   = mask          │
                                          │  over chosen background  │
                                          └───────────┬─────────────┘
                                                      ▼
                                              export PNG/WebP (alpha)
```

Key consequence: the AI models and the manual tools **don't fight** — they all just paint into the
same mask. "Undo" = restore a previous mask snapshot. "Reset" = re-run auto. "Invert" = `255 - a`.

---

## 4. Feature set

### 4.1 Automatic removal (Easy mode)
- Drop/select image → worker runs RMBG-1.4 at a working resolution (e.g. longest side 1024 for
  speed), upsamples the matte to native res → writes the mask.
- Progress UI (model download cached in IndexedDB via the runtime's cache, so 2nd run is instant).
- Result shown on a **checkerboard** transparency background with a **before/after** toggle.

### 4.2 Click-to-select — "advanced but easy" (SAM point prompts)
- User clicks **on the subject** → positive point; **shift-click** / right-click → negative point.
- SAM encoder runs **once** per image (cached); each click runs only the lightweight decoder → mask
  updates in ~10–50 ms. Feels instant.
- "Add to selection" vs "Subtract from selection" modes map to positive/negative clicks.
- Great for "the AI missed this whole object" without painting it by hand.

### 4.3 Manual brush — the core request ("shade to keep / shade to remove")
Two brush modes, toggled with a key (`K` keep / `E` erase) or a segmented control:

- **Keep brush** → paints `255` into the mask (restores pixels, even ones AI removed).
- **Remove brush** → paints `0` into the mask (excludes pixels — "shading out" the part to exclude).

Brush controls:
- **Size** (`[` / `]`), **Softness/feather** (hard edge ↔ soft falloff via a radial gradient stamp),
  **Flow/opacity** (partial alpha for delicate edges like hair).
- **Live cursor ring** showing real brush size at current zoom.
- **Pan/zoom** (space-drag / pinch / wheel) so fine edges are reachable.
- **Pressure support** via Pointer Events (`e.pressure`) for stylus/trackpad.

Advanced brush options:
- **Edge-aware ("magnetic") brush** — snaps the painted boundary to strong image gradients
  (compare neighboring luminance) so you can be sloppy near a crisp edge. Optional toggle.
- **Restore-from-original eraser** vs **background eraser** are the same mask write; the distinction
  is just which direction (`255`/`0`).

Implementation note: paint into an **offscreen single-channel buffer**, not the RGBA preview. Each
stroke = stamp a soft circle along the pointer path (interpolate points so fast drags stay smooth).
Composite preview on `requestAnimationFrame`, not per-pointer-move.

### 4.4 Edge refinement (global, non-destructive sliders)
Applied as a cheap post-pass over the mask before compositing:
- **Feather** — Gaussian blur the mask by N px (soft edges).
- **Smooth** — median/morphological open-close to kill jaggies and speckles.
- **Shift edge (grow/shrink)** — erode/dilate by N px (clip halos or recover a sliver).
- **Threshold / contrast** — harden a fuzzy matte.
- **Color decontamination / spill removal** — near the edge, subtract the old background's color
  bleed so hair/edges don't carry a green/white fringe. (Unpremultiply + edge color estimate.)

### 4.5 Background options (what shows behind the cut-out)
- **Transparent** (default) — exported as PNG/WebP alpha.
- **Solid color** (picker + hex).
- **Image** (user uploads a backdrop; subject composited over it).
- **Blur original** — keep the original photo blurred behind the sharp subject (portrait look).

### 4.6 Export
- **PNG** (lossless alpha) and **WebP** (smaller alpha) via `OffscreenCanvas.convertToBlob`.
- Optional **size presets** (original / 2048 / 1024) and **trim to content** (auto-crop to the
  subject's bounding box).
- Filename from source + `-cutout`.

### 4.7 UX niceties (user-friendly)
- **Undo/redo** (`⌘Z` / `⌘⇧Z`) backed by the mask-snapshot history.
- **Drag-and-drop + paste from clipboard** import.
- **Keyboard shortcuts** overlay (`?`).
- **Checkerboard + before/after + zoom-to-fit**.
- **Non-blocking**: all heavy ops show progress and never freeze the page.
- **Mobile/touch friendly**: pointer events, pinch-zoom, larger hit targets.
- **Reduced-motion / a11y**: focusable controls, ARIA labels, no color-only signals.

---

## 5. Component / file breakdown (Next.js App Router)

```
src/app/tools/background-remover/
  page.tsx                      # server shell; renders <Editor/> dynamically, ssr:false
src/components/bg/
  Editor.tsx                    # top-level client component; wires store + canvas + panels
  Dropzone.tsx                  # import (drag/drop/paste/file)
  CanvasStage.tsx               # Konva stage: image layer + mask-preview + brush cursor; pan/zoom
  Toolbar.tsx                   # mode switch: Auto | Click-select | Keep brush | Remove brush
  BrushControls.tsx             # size / softness / flow / edge-aware toggle
  RefinePanel.tsx               # feather / smooth / grow-shrink / defringe sliders
  BackgroundPanel.tsx           # transparent / color / image / blur
  ExportBar.tsx                 # format, size, trim, download
  HistoryControls.tsx           # undo / redo
src/lib/bg/
  store.ts                      # Zustand: image, mask, tool, brush, history
  mask.ts                       # mask ops: paint stamp, feather, erode/dilate, invert, snapshot
  compositor.ts                 # WebGL/Canvas: img × mask over background → preview + export
  worker/
    ml.worker.ts                # Comlink-exposed: initModels(), autoMatte(bitmap), samEncode(), samDecode(points)
    models.ts                   # Transformers.js RMBG/BiRefNet + onnxruntime-web SAM setup
```

Data flow: UI → Zustand → `mask.ts` (edits) → `compositor.ts` (preview). Model calls go
UI → Comlink → `ml.worker.ts` → back as transferable `ImageData`/`Float32Array`.

---

## 6. Mask math & compositing (the important details)

- **Mask**: `Uint8ClampedArray(width*height)`, 1 channel. Store at native res; models run at a
  smaller working res and the matte is bilinearly upscaled before writing.
- **Soft brush stamp**: radial gradient `a(r) = clamp((1 - r/R) / (1 - hardness), 0, 1) * flow`.
  Combine with existing mask by `max` (keep) or `min` (remove) when flow=1; for feathered strokes
  accumulate with clamping.
- **Stroke interpolation**: between two pointer samples, stamp every `spacing = R*0.25` px so fast
  drags don't leave gaps.
- **Feather**: separable Gaussian over the single channel (fast; do it in the worker for big images).
- **Grow/shrink**: min/max filter (erosion/dilation) with a circular kernel of N px.
- **Compositing (WebGL fragment shader)**:
  `fragColor = vec4(img.rgb (optionally spill-corrected), mask);` then draw the chosen background
  in a layer underneath. For export, render to an offscreen framebuffer at native res.
- **Spill removal (edge defringe)**: at pixels where `0 < a < 1`, unpremultiply, estimate the old
  background color from fully-removed neighbors, and push the edge color away from it proportional
  to `(1 - a)`.

---

## 7. Performance plan

- **WebGPU first, WASM fallback.** Detect `navigator.gpu`; otherwise load the WASM SIMD+threads
  build (needs `cross-origin-isolation` headers — see §10).
- **Everything heavy in a Worker** (model inference, feather/erode on big images, export encode).
- **Model caching**: first load downloads weights once; the runtime caches them (IndexedDB) so
  repeat visits are instant. Show a one-time "preparing (~N MB)" progress bar.
- **Working resolution**: run auto-matte at longest-side ≈1024, upscale matte. Brush/compositor
  work at native res but only the visible tile is re-composited per frame.
- **rAF-batched preview**: coalesce pointer moves; never composite synchronously in the event.
- **Transferables**: move `ArrayBuffer`s between worker/main with zero-copy transfer.
- **Lazy routes**: the whole tool is `dynamic(..., { ssr:false })` and code-split so the portfolio's
  main bundle is unaffected.

---

## 8. Phased roadmap

**Phase 0 — Spike (0.5–1 day)**
Prove auto removal end-to-end: `@imgly/background-removal` → show cut-out on checkerboard, export PNG.

**Phase 1 — MVP (Easy mode)**
Transformers.js + RMBG-1.4 in a worker (WebGPU/WASM), the mask pipeline, checkerboard preview,
before/after, transparent PNG/WebP export, drag-drop/paste import, progress + caching.

**Phase 2 — Manual brush (the core ask)**
Konva canvas with pan/zoom, keep/remove brushes (size/softness/flow), live cursor, undo/redo,
reset-to-auto, invert. This alone satisfies "shade to keep / shade to exclude."

**Phase 3 — Edge refinement**
Feather / smooth / grow-shrink / threshold / defringe sliders; background options
(color / image / blur).

**Phase 4 — Click-to-select (advanced-easy)**
MobileSAM via onnxruntime-web: encode once, decode per click, positive/negative points, merge into
the mask. Edge-aware brush. Trim-to-content export + size presets.

**Phase 5 — Polish**
Mobile/touch tuning, shortcuts overlay, a11y pass, optional batch processing, model upgrade to
BiRefNet for best edges.

---

## 9. Dependencies (client-side)

```jsonc
{
  "@huggingface/transformers": "^3",   // RMBG/BiRefNet auto-matte (WebGPU/WASM)
  "onnxruntime-web": "^1.19",          // MobileSAM click-to-select
  "konva": "^9", "react-konva": "^18", // interactive layered canvas
  "zustand": "^5",                     // state + history
  "comlink": "^4",                     // ergonomic Web Worker RPC
  // optional fast-path for Phase 0/1:
  "@imgly/background-removal": "^1"
}
```

No server dependencies in the default plan.

---

## 10. API & access guide

How the tool reaches every model, runtime asset, and browser capability it depends on — plus the
optional server API if you take the server path. **The default plan needs no API keys and no
accounts:** all models are public and loaded straight into the browser.

### 10.1 Model access (where weights come from)

| Model | Default source | Token? | Access notes |
|---|---|---|---|
| RMBG-1.4 | HuggingFace Hub `briaai/RMBG-1.4` (public) | **No** | Transformers.js fetches ONNX weights + config from the Hub CDN on first run, then caches. |
| BiRefNet (upgrade) | HF Hub (public ONNX export, e.g. `Xenova/...` / `onnx-community/...`) | **No** | Larger; load lazily only when the user opts into "best edges". |
| MobileSAM / SAM | ONNX encoder+decoder from HF Hub or your `/public/models/` | **No** | Encoder once per image, decoder per click. |
| `@imgly/background-removal` | Its own WASM/model assets via CDN or self-hosted `publicPath` | **No** | Zero-config; point `publicPath` at a pinned version for stability. |

**Two ways to serve the weights:**

1. **Remote (fastest to build)** — let the runtime fetch from the HF Hub CDN. Default behavior.
2. **Self-hosted (recommended for production)** — download the `.onnx` + `config.json` into
   `public/models/<name>/` and load locally. Pins versions, removes a third-party runtime
   dependency, and keeps everything same-origin.

```ts
// src/lib/bg/worker/models.ts  — Transformers.js setup
import { env, AutoModel, AutoProcessor } from "@huggingface/transformers";

// Remote (default): pull from the HF Hub.
env.allowRemoteModels = true;              // set false for fully self-hosted
env.remoteHost = "https://huggingface.co"; // override to a mirror/proxy if needed
// Self-hosted: ship weights under /public/models and load them instead.
// env.allowRemoteModels = false;
// env.localModelPath = "/models/";

export async function loadMatteModel() {
  const id = "briaai/RMBG-1.4";                 // or a BiRefNet repo
  const model = await AutoModel.from_pretrained(id, { device: "webgpu", dtype: "fp16" });
  const processor = await AutoProcessor.from_pretrained(id);
  return { model, processor };
}
```

### 10.2 Runtime asset access (WASM / WebGPU backends)

`onnxruntime-web` (used for SAM) and the Transformers.js WASM fallback load `.wasm` backend files.
By default these come from a CDN (jsDelivr). For production, **self-host them** so you don't depend
on a third-party CDN and so COOP/COEP (§11) is satisfied same-origin:

```ts
import * as ort from "onnxruntime-web";
// copy node_modules/onnxruntime-web/dist/*.wasm → public/ort/
ort.env.wasm.wasmPaths = "/ort/";
ort.env.wasm.numThreads = navigator.hardwareConcurrency ?? 4; // needs cross-origin isolation
const session = await ort.InferenceSession.create("/models/mobile_sam_decoder.onnx", {
  executionProviders: ["webgpu", "wasm"], // WebGPU first, WASM fallback
});
```

### 10.3 Browser API access & permissions

All client-side; most "just work" on a **secure context (HTTPS / localhost)**:

| Browser API | Used for | Access requirement |
|---|---|---|
| **WebGPU** (`navigator.gpu`) | GPU inference + compositing | Secure context; feature-detect, fall back to WASM. |
| **Web Workers (module)** | Off-thread model + mask ops | None. |
| **OffscreenCanvas / ImageBitmap** | Decode, resize, export without blocking | None. |
| **Pointer Events** (`e.pressure`) | Brush, stylus pressure | None. |
| **Clipboard** (`navigator.clipboard.read`) | Paste-to-import | Secure context + user gesture; may prompt. |
| **File System Access** (`showSaveFilePicker`) | "Save as…" export | Chromium only; **fall back to `<a download>`** elsewhere. |
| **IndexedDB / Cache Storage** | Cache model weights across visits | None. |

### 10.4 Cross-origin isolation (required for threaded WASM)

Threaded WASM (`numThreads > 1`) needs the page to be **cross-origin isolated**. Set these response
headers on the tool route (the WebGPU path does **not** need them, so this only gates the fallback):

```ts
// next.config.ts  (or headers in vercel.ts)
async headers() {
  return [{
    source: "/tools/background-remover",
    headers: [
      { key: "Cross-Origin-Opener-Policy",   value: "same-origin" },
      { key: "Cross-Origin-Embedder-Policy", value: "require-corp" },
    ],
  }];
}
```

> Note: `require-corp` means every cross-origin asset on that route must send `CORP`/CORS headers —
> another reason to **self-host** model + WASM files (§10.1–10.2).

### 10.5 Configuration (env vars)

Only needed if you want to switch sources without code changes:

```bash
# .env.local  (all optional; sensible defaults in code)
NEXT_PUBLIC_BG_MODEL=rmbg            # rmbg | birefnet
NEXT_PUBLIC_BG_REMOTE_MODELS=true    # false = load from /public/models
NEXT_PUBLIC_BG_MODEL_HOST=https://huggingface.co
# Server path only (see §10.6):
# BG_API_URL=https://bg.example.com
# BG_API_TOKEN=...                   # server-side only, never NEXT_PUBLIC_
```

### 10.6 Optional server REST API (only if you take the server path)

If you ever move inference server-side (heavier models / old browsers), expose a tiny REST API and
have the client swap its "auto" call for a `fetch`. Keep all manual tools client-side.

```
POST /api/bg/remove
  Content-Type: multipart/form-data
  fields:  image=<file>  (png/jpg/webp, ≤ ~15 MB)
  query:   ?model=rmbg|birefnet   &format=png|webp
  auth:    Authorization: Bearer <BG_API_TOKEN>   # optional; required if public
  200 →    image/png  (RGBA with alpha)           # or application/json { maskPng } for mask-only
  errors:  400 bad/oversized image · 401 bad token · 415 unsupported type · 429 rate-limited
```

- Reference impl: **FastAPI + `rembg`** (U²-Net / BiRefNet) on Vercel Fluid Compute or a GPU host.
- **Access control**: bearer token (stored server-side only), per-IP rate limiting, max upload size,
  allow-list of MIME types, and CORS limited to your origin.
- **Privacy**: process in-memory, don't persist uploads, strip EXIF on output.

### 10.7 Licensing / access terms (verify before commercial use)

| Component | License / access terms |
|---|---|
| **RMBG-1.4** (BRIA) | Free for **non-commercial**; **commercial use requires a BRIA agreement**. Fine for a portfolio/demo — confirm before monetizing. |
| **BiRefNet** | Research-friendly (MIT/Apache per the ONNX export repo) — **check the exact repo** you pull. |
| **MobileSAM / SAM** | Apache-2.0 (permissive). |
| **`@imgly/background-removal`** | Open-source core; review IMG.LY's terms for commercial/SaaS use. |
| **Transformers.js / onnxruntime-web / Konva / Zustand / Comlink** | Apache-2.0 / MIT (permissive). |

> Rule of thumb: the **tooling** is permissive; the **background-removal weights** are the only place
> with a commercial caveat (RMBG-1.4). For paid use, either sign BRIA's agreement or ship a
> permissively-licensed model (BiRefNet / U²-Net).

---

## 11. Navigation & pages (information architecture)

The tool has its own top nav — a sticky bar, active-state highlighting, keyboard-focusable, and
collapsing to a menu on mobile. Four destinations:

| Nav label | Route | Purpose |
|---|---|---|
| **Remove Background** | `/tools/background-remover` | The main editor — the tool itself (import → auto/brush/click → refine → export). This is the default landing. |
| **Developer** | `/tools/background-remover/developer` | Who built it + how it works: the pipeline (§3), the stack (§2), links back to the main portfolio, and contact. A short, human "about this tool" page. |
| **API Guide** | `/tools/background-remover/api` | Public-facing docs — the client-side usage snippets and the optional server REST API (§10.6): endpoints, auth, examples, limits. The reader-friendly version of §10. |
| **Security** | `/tools/background-remover/security` | The privacy & security statement (§12): the no-upload guarantee, what runs where, headers/CSP, and the hardening checklist. Public trust page. |

```
src/app/tools/background-remover/
  layout.tsx          # shared <ToolNav/> + page shell
  page.tsx            # "Remove Background" — the editor (client-only)
  developer/page.tsx  # "Developer"
  api/page.tsx        # "API Guide"
  security/page.tsx   # "Security"
src/components/bg/
  ToolNav.tsx         # sticky nav: 4 links, active state, mobile menu
```

- **Active state** from `usePathname()`; `aria-current="page"` on the active link.
- Nav is **server-rendered** (static) so it paints instantly; only the editor page is client-only.
- Mirror the portfolio's clean/white styling so the tool feels like part of the same site.

---

## 12. Security

Security is a first-class requirement, not an afterthought. The core promise that makes this tool
trustworthy: **by default, images never leave the user's device** — all processing is in-browser.
The Security page (§11) states this plainly to users.

### 12.1 Privacy & data handling (client-side default)
- **No upload.** Auto-matte, SAM, brush, refine, and export all run locally (WebGPU/WASM in a Worker).
- **In-memory only.** Images live in memory/`ImageBitmap`; nothing is persisted except **model
  weights** (cached in IndexedDB/Cache Storage — weights only, never user images).
- **No content telemetry.** If any analytics exist, they log events/counters, never image data.
- **Clear on exit.** Release bitmaps/buffers on unmount and `pagehide`.
- **EXIF/GPS stripped** from exported files (re-encode through a clean canvas).

### 12.2 Browser hardening (headers + CSP)
Set on the tool routes (Next `headers()` / `vercel.ts`). WASM needs `'wasm-unsafe-eval'`;
WebGPU does not eval. `connect-src` must list the model host **only if** you load weights remotely
(drop it when self-hosting — §10.1).

```http
Content-Security-Policy:
  default-src 'self';
  script-src 'self' 'wasm-unsafe-eval';
  worker-src 'self' blob:;
  img-src 'self' blob: data:;
  style-src 'self' 'unsafe-inline';
  connect-src 'self' https://huggingface.co https://cdn.jsdelivr.net;  /* remove if self-hosted */
  object-src 'none';
  base-uri 'self';
  frame-ancestors 'none';
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp        /* threaded-WASM fallback (§10.4) */
Referrer-Policy: no-referrer
X-Content-Type-Options: nosniff
Permissions-Policy: camera=(), microphone=(), geolocation=()
```

### 12.3 Input validation (untrusted files)
- **Type**: accept image MIME types only **and verify magic bytes** (don't trust the extension).
- **Size/dimensions**: cap bytes (~15 MB) and pixel count; reject **decompression bombs** before decode.
- **Decode safely**: `createImageBitmap`; on failure, reject with a friendly error — never crash.
- **Filename sanitization**: the export filename is derived from the source — strip path separators
  and HTML/control chars so it can't inject into the DOM or the download attribute.

### 12.4 Supply-chain & model integrity
- **Pin dependencies**, commit the lockfile, run `npm audit` in CI.
- **Self-host model + WASM assets** and add **Subresource Integrity** hashes / verify checksums on
  load, so a compromised CDN can't swap in malicious weights or runtime.
- Load models/runtime **only from your own origin** (enforced by the CSP above).
- Treat `@imgly` / `onnxruntime-web` / Transformers.js updates like any dependency bump — review.

### 12.5 Execution sandboxing
- Inference runs in a **Web Worker** (isolated from the DOM); only structured data crosses the
  boundary. **No `eval` of user content**; WASM is the only non-JS execution and is CSP-gated.

### 12.6 Server path hardening (only if §10.6 is used)
- **TLS everywhere**; **bearer-token auth** (server-side secret, never `NEXT_PUBLIC_`).
- **Rate-limit per IP/token**; enforce **max upload size** and **MIME allow-list**; **timeouts**
  and memory caps to prevent resource-exhaustion DoS.
- **No persistence** of uploads; process in-memory; strip EXIF on output.
- **CORS** restricted to your origin; `X-Content-Type-Options: nosniff` on responses.
- Run image decoding in an **isolated process/sandbox** (malformed-image parser exploits).

### 12.7 Security checklist (ship gate)
- [ ] No image bytes leave the device on the default path (verified in the Network panel).
- [ ] CSP + COOP/COEP + security headers live on all tool routes.
- [ ] File type verified by magic bytes; size/dimension caps enforced; bombs rejected.
- [ ] Export filename sanitized; EXIF stripped.
- [ ] Models + WASM self-hosted with integrity hashes; CSP `connect-src` tightened.
- [ ] Dependencies pinned; `npm audit` clean; lockfile committed.
- [ ] (Server path) auth, rate limits, size caps, no persistence, CORS allow-list.

---

## 13. Risks & mitigations

| Risk | Mitigation |
|---|---|
| **WASM threads need cross-origin isolation** (`COOP`/`COEP` headers) | Set the headers on the tool route (see §10.4). WebGPU path avoids the thread requirement. |
| First-load model size (tens of MB) | Cache in IndexedDB; show progress; lazy-load only on the tool route; prefer the smaller RMBG-1.4 before BiRefNet. |
| Hair / fine detail quality | BiRefNet model + feather + spill removal; SAM + brush for manual rescue. |
| Large images (>4K) jank | Tile the compositor; run filters in the worker; cap working res for inference. |
| Old browsers without WebGPU | WASM SIMD fallback; feature-detect and warn gracefully. |
| Mobile memory limits | Downscale working buffers; free `ImageBitmap`s; avoid keeping full history for huge images (store stroke deltas, not full snapshots, if memory-bound). |

---

## 14. Decision summary

- **Framework:** Next.js (this repo) + a **100% client-side** ML tool route.
- **Fastest path to ship:** `@imgly/background-removal` for auto, then build the brush.
- **Best quality/control:** **Transformers.js (RMBG-1.4 → BiRefNet) + MobileSAM**, WebGPU-accelerated,
  all in a Web Worker, editing a **single alpha mask** that the brush, click-select, and refine
  tools all share.
- **Manual "shading":** keep/remove soft brushes writing into that mask, with undo/redo — the
  heart of the user-friendly advanced experience.
```
