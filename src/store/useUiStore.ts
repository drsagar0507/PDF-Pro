import { create } from 'zustand';
import type { AnnotateTool, FillSignTool } from '../lib/types';

export interface SearchHighlight {
  pageId: string;
  rect: { x0: number; y0: number; x1: number; y1: number };
  token: number;
}

interface UiState {
  screen: 'home' | 'editor';
  zoom: number;
  currentPageIndex: number;
  showThumbRail: boolean;
  annotateTool: AnnotateTool;
  annotateColor: string;
  fillSignTool: FillSignTool;
  activeSignatureDataUrl: string | null;
  activeSignatureId: string | null;
  searchHighlight: SearchHighlight | null;

  goHome: () => void;
  goEditor: () => void;
  setZoom: (z: number) => void;
  setCurrentPageIndex: (i: number) => void;
  toggleThumbRail: () => void;
  setAnnotateTool: (t: AnnotateTool) => void;
  setAnnotateColor: (c: string) => void;
  setFillSignTool: (t: FillSignTool) => void;
  setActiveSignature: (dataUrl: string | null, id: string | null) => void;
  flashSearchHighlight: (pageId: string, rect: SearchHighlight['rect']) => void;
}

export const useUiStore = create<UiState>((set) => ({
  screen: 'home',
  zoom: 1,
  currentPageIndex: 0,
  showThumbRail: true,
  annotateTool: 'select',
  annotateColor: '#FFD54A',
  fillSignTool: 'select',
  activeSignatureDataUrl: null,
  activeSignatureId: null,
  searchHighlight: null,

  goHome: () => set({ screen: 'home' }),
  goEditor: () => set({ screen: 'editor' }),
  setZoom: (z) => set({ zoom: Math.min(4, Math.max(0.25, z)) }),
  setCurrentPageIndex: (i) => set({ currentPageIndex: i }),
  toggleThumbRail: () => set((s) => ({ showThumbRail: !s.showThumbRail })),
  setAnnotateTool: (t) => set({ annotateTool: t }),
  setAnnotateColor: (c) => set({ annotateColor: c }),
  setFillSignTool: (t) => set({ fillSignTool: t }),
  setActiveSignature: (dataUrl, id) => set({ activeSignatureDataUrl: dataUrl, activeSignatureId: id }),
  flashSearchHighlight: (pageId, rect) => set({ searchHighlight: { pageId, rect, token: Date.now() } }),
}));
