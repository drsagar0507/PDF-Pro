import { PDFDocument } from 'pdf-lib';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { loadPdfDocument } from './pdfjsSetup';

// Parsed-document caches keyed by SourceDoc id. Kept outside the Zustand
// store since these are non-serializable engine handles, not UI state —
// mutating them shouldn't trigger React re-renders.

interface CacheEntry {
  pdfjsDoc?: PDFDocumentProxy;
  pdfjsPromise?: Promise<PDFDocumentProxy>;
  pdfLibPromise?: Promise<PDFDocument>;
}

const cache = new Map<string, CacheEntry>();

function entry(sourceId: string): CacheEntry {
  let e = cache.get(sourceId);
  if (!e) {
    e = {};
    cache.set(sourceId, e);
  }
  return e;
}

export function getPdfjsDoc(sourceId: string, bytes: Uint8Array): Promise<PDFDocumentProxy> {
  const e = entry(sourceId);
  if (e.pdfjsDoc) return Promise.resolve(e.pdfjsDoc);
  if (!e.pdfjsPromise) {
    // pdf.js detaches/transfers the buffer, so hand it a copy.
    e.pdfjsPromise = loadPdfDocument(bytes.slice()).then((doc) => {
      e.pdfjsDoc = doc;
      return doc;
    });
  }
  return e.pdfjsPromise;
}

export function getPdfLibDoc(sourceId: string, bytes: Uint8Array): Promise<PDFDocument> {
  const e = entry(sourceId);
  if (!e.pdfLibPromise) {
    e.pdfLibPromise = PDFDocument.load(bytes, { updateMetadata: false });
  }
  return e.pdfLibPromise;
}

export function evictSource(sourceId: string): void {
  // PDFDocumentProxy has no public destroy() of its own (only the loading
  // task does, which we don't retain) — dropping the cache entry releases
  // our reference and lets the GC reclaim it.
  cache.delete(sourceId);
}

export function clearCache(): void {
  for (const id of Array.from(cache.keys())) evictSource(id);
}
