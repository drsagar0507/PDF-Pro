import * as pdfjsLib from 'pdfjs-dist';

// pdf.js does its heavy parsing off the main thread; point it at the worker
// bundle Vite emits, and at the static cmaps/fonts we copied into public/
// (needed for PDFs with non-embedded or CJK fonts to render correctly).
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url,
).href;

const base = import.meta.env.BASE_URL;

export const PDFJS_CMAP_URL = `${base}pdfjs/cmaps/`;
export const PDFJS_STANDARD_FONT_DATA_URL = `${base}pdfjs/standard_fonts/`;
export const PDFJS_ICC_URL = `${base}pdfjs/iccs/`;
export const PDFJS_WASM_URL = `${base}pdfjs/wasm/`;

export function loadPdfDocument(data: Uint8Array | ArrayBuffer) {
  return pdfjsLib.getDocument({
    data,
    cMapUrl: PDFJS_CMAP_URL,
    cMapPacked: true,
    standardFontDataUrl: PDFJS_STANDARD_FONT_DATA_URL,
    iccUrl: PDFJS_ICC_URL,
    wasmUrl: PDFJS_WASM_URL,
  }).promise;
}

export { pdfjsLib };
