import { create } from 'zustand';
import { nanoid } from 'nanoid';
import type {
  Annotation,
  EditorMode,
  FormFieldValue,
  NewAnnotation,
  PageRef,
  Rotation,
  SavedSignature,
  SourceDoc,
} from '../lib/types';
import { normalizeRotation } from '../lib/geometry';
import {
  getImageSize,
  imageFormatOf,
  isImageFile,
  isPdfFile,
  PX_TO_PT,
  readFileBytes,
} from '../lib/fileIO';
import { evictSource, getPdfjsDoc, clearCache } from '../lib/docCache';
import { listSignatures, saveSignature, deleteSignature as dbDeleteSignature } from '../lib/db';

interface HistorySnapshot {
  pages: PageRef[];
  annotations: Record<string, Annotation[]>;
}

interface DocState {
  fileName: string;
  sources: Record<string, SourceDoc>;
  pages: PageRef[];
  annotations: Record<string, Annotation[]>;
  formValues: Record<string, Record<string, FormFieldValue>>;
  signatures: SavedSignature[];
  mode: EditorMode;
  activePageId: string | null;
  selectedPageIds: string[];
  past: HistorySnapshot[];
  future: HistorySnapshot[];
  isLoading: boolean;

  setMode: (mode: EditorMode) => void;
  setFileName: (name: string) => void;
  setActivePage: (pageId: string | null) => void;
  toggleSelected: (pageId: string, exclusive?: boolean) => void;
  clearSelection: () => void;
  selectAll: () => void;

  addFiles: (files: File[]) => Promise<void>;
  removeSource: (sourceId: string) => void;
  reorderPages: (newOrder: PageRef[]) => void;
  rotatePages: (pageIds: string[], deltaDegrees: 90 | -90) => void;
  deletePages: (pageIds: string[]) => void;

  addAnnotation: (pageId: string, ann: NewAnnotation) => string;
  updateAnnotation: (pageId: string, id: string, patch: Partial<Annotation>) => void;
  removeAnnotation: (pageId: string, id: string) => void;
  clearAnnotationsForPage: (pageId: string) => void;

  setFormValue: (sourceId: string, field: string, value: FormFieldValue) => void;

  loadSignatures: () => Promise<void>;
  addSignature: (sig: Omit<SavedSignature, 'id' | 'createdAt'>) => Promise<void>;
  removeSignature: (id: string) => Promise<void>;

  undo: () => void;
  redo: () => void;

  reset: () => void;
}

function snapshot(state: DocState): HistorySnapshot {
  return {
    pages: state.pages.map((p) => ({ ...p })),
    annotations: Object.fromEntries(
      Object.entries(state.annotations).map(([k, v]) => [k, v.map((a) => ({ ...a }))]),
    ),
  };
}

const MAX_HISTORY = 50;

export const useDocStore = create<DocState>((set, get) => ({
  fileName: 'Untitled',
  sources: {},
  pages: [],
  annotations: {},
  formValues: {},
  signatures: [],
  mode: 'view',
  activePageId: null,
  selectedPageIds: [],
  past: [],
  future: [],
  isLoading: false,

  setMode: (mode) => set({ mode }),
  setFileName: (name) => set({ fileName: name }),
  setActivePage: (pageId) => set({ activePageId: pageId }),

  toggleSelected: (pageId, exclusive) =>
    set((s) => {
      if (exclusive) return { selectedPageIds: [pageId] };
      const has = s.selectedPageIds.includes(pageId);
      return {
        selectedPageIds: has
          ? s.selectedPageIds.filter((id) => id !== pageId)
          : [...s.selectedPageIds, pageId],
      };
    }),
  clearSelection: () => set({ selectedPageIds: [] }),
  selectAll: () => set((s) => ({ selectedPageIds: s.pages.map((p) => p.id) })),

  addFiles: async (files) => {
    set({ isLoading: true });
    try {
      const newSources: SourceDoc[] = [];
      const newPages: PageRef[] = [];

      for (const file of files) {
        if (isPdfFile(file)) {
          const bytes = await readFileBytes(file);
          const sourceId = nanoid();
          const pdfjsDoc = await getPdfjsDoc(sourceId, bytes);
          const pageCount = pdfjsDoc.numPages;
          const source: SourceDoc = {
            id: sourceId,
            name: file.name,
            bytes,
            pageCount,
            kind: 'pdf',
          };
          newSources.push(source);
          for (let i = 0; i < pageCount; i++) {
            const page = await pdfjsDoc.getPage(i + 1);
            const baseRotation = normalizeRotation(page.rotate);
            const [x0, y0, x1, y1] = page.view;
            newPages.push({
              id: nanoid(),
              sourceId,
              pageIndex: i,
              baseRotation,
              rotation: 0,
              width: x1 - x0,
              height: y1 - y0,
            });
          }
        } else if (isImageFile(file)) {
          const bytes = await readFileBytes(file);
          const format = imageFormatOf(file);
          const { width, height } = await getImageSize(bytes, format);
          const sourceId = nanoid();
          const source: SourceDoc = {
            id: sourceId,
            name: file.name,
            bytes,
            pageCount: 1,
            kind: 'image',
            imageFormat: format,
          };
          newSources.push(source);
          newPages.push({
            id: nanoid(),
            sourceId,
            pageIndex: 0,
            baseRotation: 0,
            rotation: 0,
            width: width * PX_TO_PT,
            height: height * PX_TO_PT,
          });
        }
      }

      set((s) => ({
        sources: {
          ...s.sources,
          ...Object.fromEntries(newSources.map((d) => [d.id, d])),
        },
        pages: [...s.pages, ...newPages],
        fileName:
          s.pages.length === 0 && newSources.length > 0
            ? newSources[0].name.replace(/\.(pdf|png|jpe?g)$/i, '')
            : s.fileName,
      }));
    } finally {
      set({ isLoading: false });
    }
  },

  removeSource: (sourceId) => {
    evictSource(sourceId);
    set((s) => {
      const { [sourceId]: _removed, ...rest } = s.sources;
      return {
        sources: rest,
        pages: s.pages.filter((p) => p.sourceId !== sourceId),
      };
    });
  },

  reorderPages: (newOrder) => {
    const before = snapshot(get());
    set({ pages: newOrder, past: [...get().past, before].slice(-MAX_HISTORY), future: [] });
  },

  rotatePages: (pageIds, deltaDegrees) => {
    const before = snapshot(get());
    const idSet = new Set(pageIds);
    set((s) => ({
      pages: s.pages.map((p) =>
        idSet.has(p.id)
          ? { ...p, rotation: normalizeRotation(p.rotation + deltaDegrees) as Rotation }
          : p,
      ),
      past: [...s.past, before].slice(-MAX_HISTORY),
      future: [],
    }));
  },

  deletePages: (pageIds) => {
    const before = snapshot(get());
    const idSet = new Set(pageIds);
    set((s) => ({
      pages: s.pages.filter((p) => !idSet.has(p.id)),
      selectedPageIds: s.selectedPageIds.filter((id) => !idSet.has(id)),
      past: [...s.past, before].slice(-MAX_HISTORY),
      future: [],
    }));
  },

  addAnnotation: (pageId, ann) => {
    const before = snapshot(get());
    const id = nanoid();
    const full = { ...ann, id, pageId, createdAt: Date.now() } as Annotation;
    set((s) => ({
      annotations: {
        ...s.annotations,
        [pageId]: [...(s.annotations[pageId] ?? []), full],
      },
      past: [...s.past, before].slice(-MAX_HISTORY),
      future: [],
    }));
    return id;
  },

  updateAnnotation: (pageId, id, patch) =>
    set((s) => ({
      annotations: {
        ...s.annotations,
        [pageId]: (s.annotations[pageId] ?? []).map((a) =>
          a.id === id ? ({ ...a, ...patch } as Annotation) : a,
        ),
      },
    })),

  removeAnnotation: (pageId, id) => {
    const before = snapshot(get());
    set((s) => ({
      annotations: {
        ...s.annotations,
        [pageId]: (s.annotations[pageId] ?? []).filter((a) => a.id !== id),
      },
      past: [...s.past, before].slice(-MAX_HISTORY),
      future: [],
    }));
  },

  clearAnnotationsForPage: (pageId) =>
    set((s) => ({ annotations: { ...s.annotations, [pageId]: [] } })),

  setFormValue: (sourceId, field, value) =>
    set((s) => ({
      formValues: {
        ...s.formValues,
        [sourceId]: { ...(s.formValues[sourceId] ?? {}), [field]: value },
      },
    })),

  loadSignatures: async () => {
    const sigs = await listSignatures();
    set({ signatures: sigs });
  },

  addSignature: async (sig) => {
    const full: SavedSignature = { ...sig, id: nanoid(), createdAt: Date.now() };
    await saveSignature(full);
    set((s) => ({ signatures: [full, ...s.signatures] }));
  },

  removeSignature: async (id) => {
    await dbDeleteSignature(id);
    set((s) => ({ signatures: s.signatures.filter((sig) => sig.id !== id) }));
  },

  undo: () => {
    const { past, pages, annotations } = get();
    if (past.length === 0) return;
    const prev = past[past.length - 1];
    const current: HistorySnapshot = { pages, annotations };
    set({
      pages: prev.pages,
      annotations: prev.annotations,
      past: past.slice(0, -1),
      future: [current, ...get().future].slice(0, MAX_HISTORY),
    });
  },

  redo: () => {
    const { future, pages, annotations } = get();
    if (future.length === 0) return;
    const next = future[0];
    const current: HistorySnapshot = { pages, annotations };
    set({
      pages: next.pages,
      annotations: next.annotations,
      future: future.slice(1),
      past: [...get().past, current].slice(-MAX_HISTORY),
    });
  },

  reset: () => {
    clearCache();
    set({
      fileName: 'Untitled',
      sources: {},
      pages: [],
      annotations: {},
      formValues: {},
      mode: 'view',
      activePageId: null,
      selectedPageIds: [],
      past: [],
      future: [],
    });
  },
}));
