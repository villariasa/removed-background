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

export type Tool = "keep" | "remove" | "pan";

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
  refine: RefineParams;
  background: Background;
  status: Status;
  progress: number; // 0..1
  progressLabel: string;
  error: string | null;
  maskVersion: number; // bumps whenever baseMask mutates in place
  hasAuto: boolean; // whether an AI matte has ever been produced

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
  setRefine: (r: Partial<RefineParams>) => void;
  setBackground: (b: Background) => void;
  undo: () => void;
  redo: () => void;
  invert: () => void;
  resetToAuto: () => void; // re-run handled by caller; this resets refine/history
  canUndo: () => boolean;
  canRedo: () => boolean;
}

export const useEditor = create<EditorState>((set, get) => ({
  image: null,
  baseMask: null,
  tool: "keep",
  brush: { size: 40, softness: 0.5, flow: 1 },
  refine: { feather: 0, grow: 0, threshold: 0, spill: 0 },
  background: { kind: "transparent" },
  status: "empty",
  progress: 0,
  progressLabel: "",
  error: null,
  maskVersion: 0,
  hasAuto: false,
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
}));
