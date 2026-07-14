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

/** Rotate a display-space point around a display-space center by the
 * combined page + local rotation, landing in native PDF coordinates —
 * the general form behind {@link rotatedBoxAnchor}, reused per-line by
 * drawDisplayText since a multi-line block's lines each need their own
 * anchor rotated around the block's shared center. */
function rotatePointAroundCenter(
  xDisp: number,
  yDisp: number,
  centerXDisp: number,
  centerYDisp: number,
  nativeWidth: number,
  nativeHeight: number,
  pageRotation: Rotation,
  localRotationDeg: number,
) {
  if (!localRotationDeg) {
    return displayPointToNative(xDisp, yDisp, nativeWidth, nativeHeight, pageRotation);
  }
  const combinedPdfLibDeg = pageRotation - localRotationDeg;
  const centerNative = displayPointToNative(centerXDisp, centerYDisp, nativeWidth, nativeHeight, pageRotation);
  const rad = (combinedPdfLibDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const offX = xDisp - centerXDisp;
  const offY = centerYDisp - yDisp;
  return {
    x: centerNative.x + (offX * cos - offY * sin),
    y: centerNative.y + (offX * sin + offY * cos),
  };
}

/** Draw left-aligned (or centered) text anchored at a display-space
 * top-left point, correctly handling page rotation and an optional
 * free-form local rotation around the text block's own center. Supports
 * multi-line text (split on \n). See geometry.ts for the derivation. */
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
    localRotationDeg?: number;
    lineHeight?: number;
    align?: 'left' | 'center' | 'right';
    boxWidthDisp?: number;
  },
) {
  const lineHeight = opts.lineHeight ?? opts.size * 1.25;
  const lines = opts.text.split('\n');
  const baselineDrop = opts.size * 0.82;
  const localRotationDeg = opts.localRotationDeg ?? 0;
  const combinedPdfLibDeg = opts.rotation - localRotationDeg;

  const blockWidth = opts.boxWidthDisp ?? Math.max(...lines.map((l) => opts.font.widthOfTextAtSize(l, opts.size)));
  const blockHeight = lines.length * lineHeight;
  const centerXDisp = opts.xDisp + blockWidth / 2;
  const centerYDisp = opts.yDisp + blockHeight / 2;

  lines.forEach((line, i) => {
    let xLine = opts.xDisp;
    if (opts.align && opts.align !== 'left' && opts.boxWidthDisp) {
      const textWidth = opts.font.widthOfTextAtSize(line, opts.size);
      if (opts.align === 'center') xLine = opts.xDisp + (opts.boxWidthDisp - textWidth) / 2;
      if (opts.align === 'right') xLine = opts.xDisp + opts.boxWidthDisp - textWidth;
    }
    const yLineTop = opts.yDisp + i * lineHeight;
    const native = rotatePointAroundCenter(
      xLine,
      yLineTop + baselineDrop,
      centerXDisp,
      centerYDisp,
      opts.nativeWidth,
      opts.nativeHeight,
      opts.rotation,
      localRotationDeg,
    );
    page.drawText(line, {
      x: native.x,
      y: native.y,
      size: opts.size,
      font: opts.font,
      color: opts.color,
      opacity: opts.opacity,
      rotate: degrees(combinedPdfLibDeg),
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

/**
 * Pivot math for a box that has BOTH the page's own 90°-multiple display
 * rotation AND a free-form local rotation (e.g. a user-rotated signature
 * stamp), rotating around the box's own center — matching the CSS
 * `rotate()` behavior used for the live editing preview.
 *
 * pdf-lib's `rotate` option spins content (in native, y-up, CCW-positive
 * terms — see geometry.ts) around whatever x/y anchor you give it. To make
 * that pivot land on the box's visual center instead of its bottom-left
 * corner, we compute where the bottom-left corner ends up once you rotate
 * it around the center by the combined angle, and hand pdf-lib that point.
 */
function rotatedBoxAnchor(
  xDisp: number,
  yDisp: number,
  widthDisp: number,
  heightDisp: number,
  nativeWidth: number,
  nativeHeight: number,
  pageRotation: Rotation,
  localRotationDeg: number,
) {
  const bottomLeft = rotatePointAroundCenter(
    xDisp,
    yDisp + heightDisp,
    xDisp + widthDisp / 2,
    yDisp + heightDisp / 2,
    nativeWidth,
    nativeHeight,
    pageRotation,
    localRotationDeg,
  );
  return { x: bottomLeft.x, y: bottomLeft.y, rotateDeg: pageRotation - localRotationDeg };
}

/** Draw an embedded raster image anchored at a display-space top-left
 * point + box size, correctly handling page rotation and an optional
 * free-form local rotation around the box's own center. */
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
    localRotationDeg?: number;
  },
) {
  const anchor = rotatedBoxAnchor(
    opts.xDisp,
    opts.yDisp,
    opts.widthDisp,
    opts.heightDisp,
    opts.nativeWidth,
    opts.nativeHeight,
    opts.rotation,
    opts.localRotationDeg ?? 0,
  );
  page.drawImage(image, {
    x: anchor.x,
    y: anchor.y,
    width: opts.widthDisp,
    height: opts.heightDisp,
    opacity: opts.opacity,
    rotate: degrees(anchor.rotateDeg),
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
