import { PDFDocument, PDFPage, StandardFonts, degrees } from 'pdf-lib';
import type {
  Annotation,
  FormFieldValue,
  PageNumberOptions,
  PageRef,
  SourceDoc,
  WatermarkOptions,
} from './types';
import { pageTotalRotation, parsePageRange, displaySize, displayPointToNative } from './geometry';
import { getPdfLibDoc } from './docCache';
import {
  addStickyNoteAnnotation,
  colorOf,
  drawDisplayImage,
  drawDisplayPolyline,
  drawDisplayRect,
  drawDisplayText,
} from './pdfDraw';

export interface ExportInput {
  sources: Record<string, SourceDoc>;
  pages: PageRef[];
  annotations: Record<string, Annotation[]>;
  formValues: Record<string, Record<string, FormFieldValue>>;
}

export interface ExportOptions {
  /** subset & order to export; defaults to all pages in current order */
  pageIds?: string[];
  includeAnnotations?: boolean;
  watermark?: WatermarkOptions | null;
  pageNumbers?: PageNumberOptions | null;
}

function dataUrlToBytes(dataUrl: string): { bytes: Uint8Array; format: 'png' | 'jpg' } {
  const [meta, b64] = dataUrl.split(',');
  const format = /png/i.test(meta) ? 'png' : 'jpg';
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return { bytes, format };
}

async function buildFilledFormDocs(
  input: ExportInput,
): Promise<Map<string, PDFDocument>> {
  const filled = new Map<string, PDFDocument>();
  for (const [sourceId, fields] of Object.entries(input.formValues)) {
    if (Object.keys(fields).length === 0) continue;
    const source = input.sources[sourceId];
    if (!source || source.kind !== 'pdf') continue;
    const doc = await PDFDocument.load(source.bytes, { updateMetadata: false });
    let form;
    try {
      form = doc.getForm();
    } catch {
      continue;
    }
    for (const [fieldName, fv] of Object.entries(fields)) {
      try {
        if (fv.type === 'text') {
          form.getTextField(fieldName).setText(fv.value ? String(fv.value) : '');
        } else if (fv.type === 'checkbox') {
          const cb = form.getCheckBox(fieldName);
          if (fv.value) cb.check();
          else cb.uncheck();
        } else if (fv.type === 'radio') {
          form.getRadioGroup(fieldName).select(String(fv.value));
        } else if (fv.type === 'dropdown') {
          form.getDropdown(fieldName).select(String(fv.value));
        } else if (fv.type === 'optionlist') {
          form.getOptionList(fieldName).select(String(fv.value));
        }
      } catch {
        // field missing or type mismatch — skip rather than fail the whole export
      }
    }
    try {
      form.flatten();
    } catch {
      // if flatten fails (malformed field), fall back to unflattened doc
    }
    filled.set(sourceId, doc);
  }
  return filled;
}

function drawAnnotation(
  page: PDFPage,
  ann: Annotation,
  nativeWidth: number,
  nativeHeight: number,
  rotation: 0 | 90 | 180 | 270,
  helveticaFont: Awaited<ReturnType<PDFDocument['embedFont']>>,
) {
  const color = colorOf(ann.color);
  switch (ann.kind) {
    case 'highlight':
      drawDisplayRect(page, {
        xDisp: ann.x,
        yDisp: ann.y,
        widthDisp: ann.width,
        heightDisp: ann.height,
        color,
        opacity: ann.opacity,
        nativeWidth,
        nativeHeight,
        rotation,
      });
      break;
    case 'ink':
      drawDisplayPolyline(page, ann.points, {
        color,
        thickness: ann.strokeWidth,
        nativeWidth,
        nativeHeight,
        rotation,
      });
      break;
    case 'text':
      drawDisplayText(page, {
        xDisp: ann.x,
        yDisp: ann.y,
        text: ann.text,
        font: helveticaFont,
        size: ann.fontSize,
        color,
        nativeWidth,
        nativeHeight,
        rotation,
        localRotationDeg: ann.rotation ?? 0,
      });
      break;
    case 'note':
      addStickyNoteAnnotation(page, {
        xDisp: ann.x,
        yDisp: ann.y,
        contents: ann.text,
        nativeWidth,
        nativeHeight,
        rotation,
      });
      break;
    case 'image':
      // Image annotations need an async embedPng/embedJpg call, so the
      // caller handles them directly rather than routing through here.
      break;
    case 'checkmark':
    case 'xmark':
    case 'circle':
    case 'line':
      drawShapeAnnotation(page, ann, nativeWidth, nativeHeight, rotation, color);
      break;
  }
}

function drawShapeAnnotation(
  page: PDFPage,
  ann: Extract<Annotation, { kind: 'checkmark' | 'xmark' | 'circle' | 'line' }>,
  nativeWidth: number,
  nativeHeight: number,
  rotation: 0 | 90 | 180 | 270,
  color: ReturnType<typeof colorOf>,
) {
  const { x, y, width, height, strokeWidth } = ann;
  const pts = (a: { x: number; y: number }, b: { x: number; y: number }) =>
    drawDisplayPolyline(page, [a, b], { color, thickness: strokeWidth, nativeWidth, nativeHeight, rotation });

  if (ann.kind === 'checkmark') {
    const p1 = { x: x + width * 0.05, y: y + height * 0.55 };
    const p2 = { x: x + width * 0.4, y: y + height * 0.9 };
    const p3 = { x: x + width * 0.95, y: y + height * 0.15 };
    drawDisplayPolyline(page, [p1, p2, p3], { color, thickness: strokeWidth, nativeWidth, nativeHeight, rotation });
  } else if (ann.kind === 'xmark') {
    pts({ x, y }, { x: x + width, y: y + height });
    pts({ x: x + width, y }, { x, y: y + height });
  } else if (ann.kind === 'line') {
    pts({ x, y: y + height / 2 }, { x: x + width, y: y + height / 2 });
  } else if (ann.kind === 'circle') {
    const cx = x + width / 2;
    const cy = y + height / 2;
    // Approximate the ellipse as a point-cloud polygon so the same
    // rotation-aware point transform used everywhere else applies cleanly.
    const steps = 48;
    const ringPts: { x: number; y: number }[] = [];
    for (let i = 0; i <= steps; i++) {
      const t = (i / steps) * Math.PI * 2;
      ringPts.push({ x: cx + (width / 2) * Math.cos(t), y: cy + (height / 2) * Math.sin(t) });
    }
    drawDisplayPolyline(page, ringPts, { color, thickness: strokeWidth, nativeWidth, nativeHeight, rotation });
  }
}

export async function buildOutputPdf(
  input: ExportInput,
  options: ExportOptions = {},
): Promise<Uint8Array> {
  const outDoc = await PDFDocument.create();
  outDoc.setProducer('PDF Pro');
  outDoc.setCreator('PDF Pro');

  const pageList = options.pageIds
    ? options.pageIds
        .map((id) => input.pages.find((p) => p.id === id))
        .filter((p): p is PageRef => !!p)
    : input.pages;

  const filledForms = await buildFilledFormDocs(input);

  // Group by source for efficient batched copyPages calls, but remember
  // final order via the pageList iteration below.
  const bySource = new Map<string, PageRef[]>();
  for (const p of pageList) {
    if (input.sources[p.sourceId]?.kind !== 'pdf') continue;
    if (!bySource.has(p.sourceId)) bySource.set(p.sourceId, []);
    bySource.get(p.sourceId)!.push(p);
  }

  const copiedByPageId = new Map<string, PDFPage>();
  for (const [sourceId, list] of bySource) {
    const source = input.sources[sourceId];
    const srcDoc = filledForms.get(sourceId) ?? (await getPdfLibDoc(sourceId, source.bytes));
    const indices = list.map((p) => p.pageIndex);
    const copied = await outDoc.copyPages(srcDoc, indices);
    list.forEach((p, i) => copiedByPageId.set(p.id, copied[i]));
  }

  const helvetica = await outDoc.embedFont(StandardFonts.Helvetica);
  const helveticaBold = await outDoc.embedFont(StandardFonts.HelveticaBold);

  const finalPages: { page: PDFPage; ref: PageRef }[] = [];

  for (const ref of pageList) {
    const source = input.sources[ref.sourceId];
    let outPage: PDFPage;

    if (source.kind === 'pdf') {
      outPage = copiedByPageId.get(ref.id)!;
      outDoc.addPage(outPage);
    } else {
      outPage = outDoc.addPage([ref.width, ref.height]);
      const image =
        source.imageFormat === 'png'
          ? await outDoc.embedPng(source.bytes)
          : await outDoc.embedJpg(source.bytes);
      outPage.drawImage(image, { x: 0, y: 0, width: ref.width, height: ref.height });
    }

    const totalRotation = pageTotalRotation(ref);
    outPage.setRotation(degrees(totalRotation));
    finalPages.push({ page: outPage, ref });
  }

  if (options.includeAnnotations !== false) {
    for (const { page, ref } of finalPages) {
      const anns = input.annotations[ref.id] ?? [];
      const rotation = pageTotalRotation(ref);
      for (const ann of anns) {
        if (ann.kind === 'image') {
          const { bytes, format } = dataUrlToBytes(ann.dataUrl);
          const image = format === 'png' ? await outDoc.embedPng(bytes) : await outDoc.embedJpg(bytes);
          drawDisplayImage(page, image, {
            xDisp: ann.x,
            yDisp: ann.y,
            widthDisp: ann.width,
            heightDisp: ann.height,
            nativeWidth: ref.width,
            nativeHeight: ref.height,
            rotation,
            localRotationDeg: ann.rotation ?? 0,
          });
        } else {
          drawAnnotation(page, ann, ref.width, ref.height, rotation, helvetica);
        }
      }
    }
  }

  if (options.watermark && options.watermark.text.trim()) {
    applyWatermark(finalPages, options.watermark, helveticaBold);
  }

  if (options.pageNumbers) {
    applyPageNumbers(finalPages, options.pageNumbers, helvetica);
  }

  return outDoc.save();
}

function applyWatermark(
  finalPages: { page: PDFPage; ref: PageRef }[],
  wm: WatermarkOptions,
  font: Awaited<ReturnType<PDFDocument['embedFont']>>,
) {
  const indices = parsePageRange(wm.pageRange, finalPages.length);
  const color = colorOf(wm.color);
  const textWidth = font.widthOfTextAtSize(wm.text, wm.fontSize);

  for (const idx of indices) {
    const { page, ref } = finalPages[idx];
    const rotation = pageTotalRotation(ref);
    const { width: dw, height: dh } = displaySize(ref.width, ref.height, rotation);

    let xDisp: number;
    let yDisp: number;
    const margin = 36;
    switch (wm.position) {
      case 'top-left':
        xDisp = margin;
        yDisp = margin;
        break;
      case 'top-right':
        xDisp = dw - textWidth - margin;
        yDisp = margin;
        break;
      case 'bottom-left':
        xDisp = margin;
        yDisp = dh - margin - wm.fontSize;
        break;
      case 'bottom-right':
        xDisp = dw - textWidth - margin;
        yDisp = dh - margin - wm.fontSize;
        break;
      default:
        xDisp = (dw - textWidth) / 2;
        yDisp = (dh - wm.fontSize) / 2;
    }

    // Center-rotate the watermark text around its own middle for the
    // "diagonal stamp" look, independent of the page's own rotation.
    const cx = xDisp + textWidth / 2;
    const cy = yDisp + wm.fontSize / 2;
    const rad = (-wm.rotation * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const relX = xDisp - cx;
    const relY = yDisp - cy;
    const rotatedX = cx + (relX * cos - relY * sin);
    const rotatedY = cy + (relX * sin + relY * cos);

    const native = displayPointToNative(
      rotatedX,
      rotatedY,
      ref.width,
      ref.height,
      rotation,
    );

    page.drawText(wm.text, {
      x: native.x,
      y: native.y,
      size: wm.fontSize,
      font,
      color,
      opacity: wm.opacity,
      rotate: degrees(rotation + wm.rotation),
    });
  }
}

function applyPageNumbers(
  finalPages: { page: PDFPage; ref: PageRef }[],
  opts: PageNumberOptions,
  font: Awaited<ReturnType<PDFDocument['embedFont']>>,
) {
  const indices = parsePageRange(opts.pageRange, finalPages.length);
  const color = colorOf(opts.color);
  const margin = 28;

  indices.forEach((idx, i) => {
    const { page, ref } = finalPages[idx];
    const rotation = pageTotalRotation(ref);
    const { width: dw, height: dh } = displaySize(ref.width, ref.height, rotation);
    const label = opts.format
      .replace('{n}', String(opts.startAt + i))
      .replace('{total}', String(indices.length));
    const textWidth = font.widthOfTextAtSize(label, opts.fontSize);

    let xDisp: number;
    let yDisp: number;
    const isTop = opts.position.startsWith('top');
    yDisp = isTop ? margin : dh - margin - opts.fontSize;
    if (opts.position.endsWith('left')) xDisp = margin;
    else if (opts.position.endsWith('right')) xDisp = dw - textWidth - margin;
    else xDisp = (dw - textWidth) / 2;

    drawDisplayText(page, {
      xDisp,
      yDisp,
      text: label,
      font,
      size: opts.fontSize,
      color,
      nativeWidth: ref.width,
      nativeHeight: ref.height,
      rotation,
    });
  });
}
