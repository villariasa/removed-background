"use client";

import { create } from "zustand";
import {
  cloneMask,
  createMask,
  invert as invertMask,
  type BrushMode,
  type Mask,
} from "./mask";
import type { Background } from "./compositor";

export type Tool = "keep" | "remove" | "wand" | "lasso" | "pan";
export type SelectMode = "add" | "subtract";

export interface RefineParams {
  feather: number; // px gaussian
  grow: number; // px erode(-)/dilate(+)
  threshold: number; // 0..1 harden
  spill: number; // 0..1 edge decontamination
}

export interface BrushParams {
  size: number; // px at native res
  softness: number; // 0..1
  flow: number; // 0..1
}

export interface WandParams {
  tolerance: number; // 0..100
  contiguous: boolean;
}

export interface DetectedObject {
  id: number;
  label: string;
  score: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  selected: boolean;
  // Opt-in CLIP open-vocabulary naming ("Identify unclear objects") — set
  // only when it disagrees with `label` above a confidence floor. Shown as
  // a secondary "possibly: X" hint, never replaces the primary label.
  altLabel?: string;
  altScore?: number;
}

export type DetectStatus = "idle" | "detecting" | "ready" | "segmenting" | "identifying";

export type Status = "empty" | "loading-model" | "processing" | "ready";

interface LoadedImage {
  imageData: ImageData;
  width: number;
  height: number;
  name: string;
}

const HISTORY_LIMIT = 40;

interface EditorState {
  image: LoadedImage | null;
  baseMask: Mask | null; // auto + brush edits (refine applied non-destructively on top)
  tool: Tool;
  brush: BrushParams;
  wand: WandParams;
  selectMode: SelectMode;
  refine: RefineParams;
  background: Background;
  status: Status;
  progress: number; // 0..1
  progressLabel: string;
  error: string | null;
  maskVersion: number; // bumps whenever baseMask mutates in place
  hasAuto: boolean; // whether an AI matte has ever been produced

  // object detection + pick-to-segment (plan §4.2, point-prompted SAM)
  detectStatus: DetectStatus;
  detections: DetectedObject[];

  // history
  history: Mask[];
  historyIndex: number;

  // actions
  setImage: (img: LoadedImage) => void;
  clearImage: () => void;
  setStatus: (s: Status) => void;
  setProgress: (p: number, label?: string) => void;
  setError: (e: string | null) => void;
  setAutoMask: (mask: Mask) => void;
  commitStroke: () => void; // snapshot after a brush stroke
  bumpMask: () => void; // signal in-place mask mutation
  setTool: (t: Tool) => void;
  setBrush: (b: Partial<BrushParams>) => void;
  setWand: (w: Partial<WandParams>) => void;
  setSelectMode: (m: SelectMode) => void;
  applySelection: (sel: Uint8ClampedArray, mode: SelectMode) => void;
  setRefine: (r: Partial<RefineParams>) => void;
  setBackground: (b: Background) => void;
  undo: () => void;
  redo: () => void;
  invert: () => void;
  resetToAuto: () => void; // re-run handled by caller; this resets refine/history
  canUndo: () => boolean;
  canRedo: () => boolean;

  setDetectStatus: (s: DetectStatus) => void;
  setDetections: (boxes: Omit<DetectedObject, "id" | "selected">[]) => void;
  toggleDetection: (id: number) => void;
  selectAllDetections: (selected: boolean) => void;
  clearDetections: () => void;
  applyIdentifyResults: (boxes: Omit<DetectedObject, "id" | "selected">[]) => void;
}

export const useEditor = create<EditorState>((set, get) => ({
  image: null,
  baseMask: null,
  tool: "keep",
  brush: { size: 40, softness: 0.5, flow: 1 },
  wand: { tolerance: 35, contiguous: true },
  // Default to "remove" — the overwhelmingly common first move is clicking
  // the background to delete it. "add" is a no-op on a freshly-loaded image
  // since the mask already starts fully kept (255 everywhere).
  selectMode: "subtract",
  refine: { feather: 0, grow: 0, threshold: 0, spill: 0 },
  background: { kind: "transparent" },
  status: "empty",
  progress: 0,
  progressLabel: "",
  error: null,
  maskVersion: 0,
  hasAuto: false,
  detectStatus: "idle",
  detections: [],
  history: [],
  historyIndex: -1,

  setImage: (img) =>
    set({
      image: img,
      baseMask: createMask(img.width, img.height, 255),
      status: "ready",
      error: null,
      refine: { feather: 0, grow: 0, threshold: 0, spill: 0 },
      background: { kind: "transparent" },
      hasAuto: false,
      detectStatus: "idle",
      detections: [],
      history: [],
      historyIndex: -1,
      maskVersion: get().maskVersion + 1,
    }),

  clearImage: () =>
    set({
      image: null,
      baseMask: null,
      status: "empty",
      error: null,
      history: [],
      historyIndex: -1,
      hasAuto: false,
    }),

  setStatus: (status) => set({ status }),
  setProgress: (progress, progressLabel) =>
    set((s) => ({ progress, progressLabel: progressLabel ?? s.progressLabel })),
  setError: (error) => set({ error, status: error ? "ready" : get().status }),

  setAutoMask: (mask) => {
    const snapshot = cloneMask(mask);
    set((s) => ({
      baseMask: mask,
      hasAuto: true,
      status: "ready",
      maskVersion: s.maskVersion + 1,
      history: [snapshot],
      historyIndex: 0,
    }));
  },

  commitStroke: () => {
    const { baseMask, history, historyIndex } = get();
    if (!baseMask) return;
    const trimmed = history.slice(0, historyIndex + 1);
    trimmed.push(cloneMask(baseMask));
    while (trimmed.length > HISTORY_LIMIT) trimmed.shift();
    set({ history: trimmed, historyIndex: trimmed.length - 1 });
  },

  bumpMask: () => set((s) => ({ maskVersion: s.maskVersion + 1 })),

  setTool: (tool) => set({ tool }),
  setBrush: (b) => set((s) => ({ brush: { ...s.brush, ...b } })),
  setWand: (w) => set((s) => ({ wand: { ...s.wand, ...w } })),
  setSelectMode: (selectMode) => set({ selectMode }),

  applySelection: (sel, mode) => {
    const { baseMask } = get();
    if (!baseMask) return;
    const value = mode === "add" ? 255 : 0;
    for (let i = 0; i < sel.length; i++) {
      if (sel[i] > 0) baseMask[i] = value;
    }
    get().bumpMask();
    get().commitStroke();
  },
  setRefine: (r) => set((s) => ({ refine: { ...s.refine, ...r } })),
  setBackground: (background) => set({ background }),

  undo: () => {
    const { history, historyIndex } = get();
    if (historyIndex <= 0) return;
    const idx = historyIndex - 1;
    set((s) => ({
      historyIndex: idx,
      baseMask: cloneMask(history[idx]),
      maskVersion: s.maskVersion + 1,
    }));
  },

  redo: () => {
    const { history, historyIndex } = get();
    if (historyIndex >= history.length - 1) return;
    const idx = historyIndex + 1;
    set((s) => ({
      historyIndex: idx,
      baseMask: cloneMask(history[idx]),
      maskVersion: s.maskVersion + 1,
    }));
  },

  invert: () => {
    const { baseMask } = get();
    if (!baseMask) return;
    const next = cloneMask(baseMask);
    invertMask(next);
    set((s) => ({ baseMask: next, maskVersion: s.maskVersion + 1 }));
    get().commitStroke();
  },

  resetToAuto: () =>
    set({ refine: { feather: 0, grow: 0, threshold: 0, spill: 0 } }),

  canUndo: () => get().historyIndex > 0,
  canRedo: () => get().historyIndex < get().history.length - 1,

  setDetectStatus: (detectStatus) => set({ detectStatus }),

  setDetections: (boxes) =>
    set({
      detections: boxes.map((b, i) => ({ ...b, id: i, selected: true })),
      detectStatus: "ready",
    }),

  toggleDetection: (id) =>
    set((s) => ({
      detections: s.detections.map((d) => (d.id === id ? { ...d, selected: !d.selected } : d)),
    })),

  selectAllDetections: (selected) =>
    set((s) => ({ detections: s.detections.map((d) => ({ ...d, selected })) })),

  clearDetections: () => set({ detections: [], detectStatus: "idle" }),

  // Positional merge: the caller must pass get().detections (in the same
  // order) to identifyObjects() so the returned array lines up index-for-index.
  applyIdentifyResults: (boxes) =>
    set((s) => ({
      detections: s.detections.map((d, i) => ({
        ...d,
        altLabel: boxes[i]?.altLabel,
        altScore: boxes[i]?.altScore,
      })),
      detectStatus: "ready",
    })),
}));
