import { PDFDocument } from 'pdf-lib';
import type { PageRef, SourceDoc } from './types';
import { pageTotalRotation } from './geometry';
import { getPdfjsDoc } from './docCache';

export type CompressLevel = 'low' | 'medium' | 'high';

const PRESETS: Record<CompressLevel, { scale: number; quality: number }> = {
  low: { scale: 1.5, quality: 0.85 },
  medium: { scale: 1.1, quality: 0.7 },
  high: { scale: 0.85, quality: 0.5 },
};

/**
 * Rasterizes every page to a JPEG at a reduced resolution/quality and
 * rebuilds a new, smaller PDF from those images. This flattens text to
 * pixels (no longer selectable/searchable) in exchange for a reliable,
 * predictable size reduction — the same trade-off most "compress PDF"
 * tools make, and the one that actually helps on the documents where size
 * is a real problem: scans and photo-heavy PDFs, which are already mostly
 * raster content to begin with.
 */
export async function compressPdf(
  pages: PageRef[],
  sources: Record<string, SourceDoc>,
  level: CompressLevel,
): Promise<Uint8Array> {
  const { scale, quality } = PRESETS[level];
  const outDoc = await PDFDocument.create();
  outDoc.setProducer('PDF Pro');

  for (const ref of pages) {
    const source = sources[ref.sourceId];
    if (!source) continue;

    let blob: Blob;
    let pxWidth: number;
    let pxHeight: number;

    if (source.kind === 'image') {
      const rotation = pageTotalRotation(ref);
      const dispW = rotation % 180 === 0 ? ref.width : ref.height;
      const dispH = rotation % 180 === 0 ? ref.height : ref.width;
      pxWidth = Math.round(dispW * scale);
      pxHeight = Math.round(dispH * scale);
      const canvas = document.createElement('canvas');
      canvas.width = pxWidth;
      canvas.height = pxHeight;
      const ctx = canvas.getContext('2d')!;
      const bitmap = await createImageBitmap(new Blob([source.bytes.buffer as ArrayBuffer]));
      // Draw at the page's own (unrotated) point-based size, scaled down —
      // not the source photo's raw pixel count — then let the rotate
      // transform reorient it to fill the (possibly swapped) canvas.
      const drawW = ref.width * scale;
      const drawH = ref.height * scale;
      ctx.save();
      ctx.translate(pxWidth / 2, pxHeight / 2);
      ctx.rotate((rotation * Math.PI) / 180);
      ctx.drawImage(bitmap, -drawW / 2, -drawH / 2, drawW, drawH);
      ctx.restore();
      blob = await new Promise((resolve, reject) =>
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/jpeg', quality),
      );
    } else {
      const doc = await getPdfjsDoc(source.id, source.bytes);
      const pdfPage = await doc.getPage(ref.pageIndex + 1);
      const rotation = pageTotalRotation(ref);
      const viewport = pdfPage.getViewport({ scale, rotation });
      pxWidth = Math.ceil(viewport.width);
      pxHeight = Math.ceil(viewport.height);
      const canvas = document.createElement('canvas');
      canvas.width = pxWidth;
      canvas.height = pxHeight;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, pxWidth, pxHeight);
      await pdfPage.render({ canvas, canvasContext: ctx, viewport }).promise;
      blob = await new Promise((resolve, reject) =>
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/jpeg', quality),
      );
    }

    const jpgBytes = new Uint8Array(await blob.arrayBuffer());
    const image = await outDoc.embedJpg(jpgBytes);
    const rotation = pageTotalRotation(ref);
    const dispW = rotation % 180 === 0 ? ref.width : ref.height;
    const dispH = rotation % 180 === 0 ? ref.height : ref.width;
    const page = outDoc.addPage([dispW, dispH]);
    page.drawImage(image, { x: 0, y: 0, width: dispW, height: dispH });
  }

  return outDoc.save();
}
