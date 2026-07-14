import {
  PDFPage,
  PDFFont,
  rgb,
  degrees,
  type Color,
  type RGB,
} from 'pdf-lib';
import type { Rotation } from './types';
import { displayPointToNative, displayRectToNative } from './geometry';

export function hexToRgb(hex: string): RGB {
  const clean = hex.replace('#', '');
  const n = parseInt(clean.length === 3
    ? clean.split('').map((c) => c + c).join('')
    : clean, 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

export function colorOf(hex: string): Color {
  return hexToRgb(hex);
}

/** Draw left-aligned (or centered) text anchored at a display-space
 * top-left point, correctly handling page rotation. Supports multi-line
 * text (split on \n). See geometry.ts for the coordinate derivation. */
export function drawDisplayText(
  page: PDFPage,
  opts: {
    xDisp: number;
    yDisp: number;
    text: string;
    font: PDFFont;
    size: number;
    color: Color;
    opacity?: number;
    nativeWidth: number;
    nativeHeight: number;
    rotation: Rotation;
    lineHeight?: number;
    align?: 'left' | 'center' | 'right';
    boxWidthDisp?: number;
  },
) {
  const lineHeight = opts.lineHeight ?? opts.size * 1.25;
  const lines = opts.text.split('\n');
  const baselineDrop = opts.size * 0.82;

  lines.forEach((line, i) => {
    let xLine = opts.xDisp;
    if (opts.align && opts.align !== 'left' && opts.boxWidthDisp) {
      const textWidth = opts.font.widthOfTextAtSize(line, opts.size);
      if (opts.align === 'center') xLine = opts.xDisp + (opts.boxWidthDisp - textWidth) / 2;
      if (opts.align === 'right') xLine = opts.xDisp + opts.boxWidthDisp - textWidth;
    }
    const yLineTop = opts.yDisp + i * lineHeight;
    const anchorDisp = { x: xLine, y: yLineTop + baselineDrop };
    const native = displayPointToNative(
      anchorDisp.x,
      anchorDisp.y,
      opts.nativeWidth,
      opts.nativeHeight,
      opts.rotation,
    );
    page.drawText(line, {
      x: native.x,
      y: native.y,
      size: opts.size,
      font: opts.font,
      color: opts.color,
      opacity: opts.opacity,
      rotate: degrees(opts.rotation),
    });
  });
}

export function drawDisplayRect(
  page: PDFPage,
  opts: {
    xDisp: number;
    yDisp: number;
    widthDisp: number;
    heightDisp: number;
    color: Color;
    opacity?: number;
    nativeWidth: number;
    nativeHeight: number;
    rotation: Rotation;
    borderColor?: Color;
    borderWidth?: number;
  },
) {
  const r = displayRectToNative(
    opts.xDisp,
    opts.yDisp,
    opts.widthDisp,
    opts.heightDisp,
    opts.nativeWidth,
    opts.nativeHeight,
    opts.rotation,
  );
  page.drawRectangle({
    x: r.x,
    y: r.y,
    width: r.width,
    height: r.height,
    color: opts.color,
    opacity: opts.opacity,
    borderColor: opts.borderColor,
    borderWidth: opts.borderWidth,
  });
}

/** Draw a polyline (ink stroke) given points in display space. */
export function drawDisplayPolyline(
  page: PDFPage,
  points: { x: number; y: number }[],
  opts: {
    color: Color;
    thickness: number;
    opacity?: number;
    nativeWidth: number;
    nativeHeight: number;
    rotation: Rotation;
  },
) {
  const native = points.map((p) =>
    displayPointToNative(p.x, p.y, opts.nativeWidth, opts.nativeHeight, opts.rotation),
  );
  for (let i = 0; i < native.length - 1; i++) {
    page.drawLine({
      start: native[i],
      end: native[i + 1],
      thickness: opts.thickness,
      color: opts.color,
      opacity: opts.opacity,
      lineCap: 1,
    });
  }
}

/** Draw an embedded raster image anchored at a display-space top-left
 * point + box size, correctly handling page rotation. */
export function drawDisplayImage(
  page: PDFPage,
  image: Parameters<PDFPage['drawImage']>[0],
  opts: {
    xDisp: number;
    yDisp: number;
    widthDisp: number;
    heightDisp: number;
    opacity?: number;
    nativeWidth: number;
    nativeHeight: number;
    rotation: Rotation;
  },
) {
  const bottomLeftDisp = { x: opts.xDisp, y: opts.yDisp + opts.heightDisp };
  const native = displayPointToNative(
    bottomLeftDisp.x,
    bottomLeftDisp.y,
    opts.nativeWidth,
    opts.nativeHeight,
    opts.rotation,
  );
  page.drawImage(image, {
    x: native.x,
    y: native.y,
    width: opts.widthDisp,
    height: opts.heightDisp,
    opacity: opts.opacity,
    rotate: degrees(opts.rotation),
  });
}

/** Attach a real, clickable PDF "Text" (sticky-note) annotation. */
export function addStickyNoteAnnotation(
  page: PDFPage,
  opts: {
    xDisp: number;
    yDisp: number;
    contents: string;
    nativeWidth: number;
    nativeHeight: number;
    rotation: Rotation;
    color?: [number, number, number];
  },
) {
  const size = 20;
  const p1 = displayPointToNative(
    opts.xDisp,
    opts.yDisp + size,
    opts.nativeWidth,
    opts.nativeHeight,
    opts.rotation,
  );
  const p2 = displayPointToNative(
    opts.xDisp + size,
    opts.yDisp,
    opts.nativeWidth,
    opts.nativeHeight,
    opts.rotation,
  );
  const x0 = Math.min(p1.x, p2.x);
  const y0 = Math.min(p1.y, p2.y);
  const x1 = Math.max(p1.x, p2.x);
  const y1 = Math.max(p1.y, p2.y);

  const context = page.doc.context;
  const [r, g, b] = opts.color ?? [1, 0.82, 0.2];
  const annotDict = context.obj({
    Type: 'Annot',
    Subtype: 'Text',
    Rect: [x0, y0, x1, y1],
    Contents: context.obj(opts.contents),
    C: [r, g, b],
    Name: 'Comment',
    Open: false,
    F: 4,
  });
  const annotRef = context.register(annotDict);
  page.node.addAnnot(annotRef);
}
