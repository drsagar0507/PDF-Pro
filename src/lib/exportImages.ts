import JSZip from 'jszip';
import type { PageRef, SourceDoc } from './types';
import { pageTotalRotation } from './geometry';
import { getPdfjsDoc } from './docCache';

export interface ExportImagesOptions {
  format: 'png' | 'jpeg';
  quality: number;
  scale: number;
  pageIndices: number[];
}

async function renderPageToBlob(
  ref: PageRef,
  source: SourceDoc,
  opts: ExportImagesOptions,
): Promise<Blob> {
  if (source.kind === 'image') {
    return new Blob([source.bytes.buffer as ArrayBuffer], {
      type: source.imageFormat === 'png' ? 'image/png' : 'image/jpeg',
    });
  }
  const doc = await getPdfjsDoc(source.id, source.bytes);
  const pdfPage = await doc.getPage(ref.pageIndex + 1);
  const rotation = pageTotalRotation(ref);
  const viewport = pdfPage.getViewport({ scale: opts.scale, rotation });
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const ctx = canvas.getContext('2d')!;
  if (opts.format === 'jpeg') {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  await pdfPage.render({ canvas, canvasContext: ctx, viewport }).promise;
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('toBlob failed'))),
      opts.format === 'png' ? 'image/png' : 'image/jpeg',
      opts.quality,
    ),
  );
}

/** Renders the given pages to images and returns a zip file's bytes. If
 * only one page is requested, returns that single image's bytes directly
 * instead (no point zipping one file). */
export async function exportPagesAsImages(
  pages: PageRef[],
  sources: Record<string, SourceDoc>,
  opts: ExportImagesOptions,
): Promise<{ bytes: Uint8Array; filename: string; mime: string }> {
  const ext = opts.format === 'png' ? 'png' : 'jpg';
  const targets = opts.pageIndices.map((i) => pages[i]).filter((p): p is PageRef => !!p);

  if (targets.length === 1) {
    const ref = targets[0];
    const blob = await renderPageToBlob(ref, sources[ref.sourceId], opts);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    return { bytes, filename: `page-${opts.pageIndices[0] + 1}.${ext}`, mime: blob.type };
  }

  const zip = new JSZip();
  for (const idx of opts.pageIndices) {
    const ref = pages[idx];
    if (!ref) continue;
    const blob = await renderPageToBlob(ref, sources[ref.sourceId], opts);
    zip.file(`page-${idx + 1}.${ext}`, blob);
  }
  const bytes = await zip.generateAsync({ type: 'uint8array' });
  return { bytes, filename: 'pages.zip', mime: 'application/zip' };
}
