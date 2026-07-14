import { loadPdfDocument } from './pdfjsSetup';

/** Renders page 1 of a PDF to a small JPEG data URL, for recent-file
 * previews. Uses a throwaway pdf.js document (not the shared docCache)
 * since this runs once at save time, not during interactive editing. */
export async function renderThumbnailDataUrl(bytes: Uint8Array, targetWidth = 240): Promise<string | undefined> {
  try {
    const doc = await loadPdfDocument(bytes.slice());
    const page = await doc.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const scale = targetWidth / base.width;
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;
    await page.render({ canvas, canvasContext: ctx, viewport }).promise;
    return canvas.toDataURL('image/jpeg', 0.75);
  } catch {
    return undefined;
  }
}
