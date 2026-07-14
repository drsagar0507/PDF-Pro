import type { PageRef, Rotation } from './types';

/**
 * All annotation coordinates are authored in "display space": origin at the
 * page's top-left corner as the user currently sees it (after `rotation` is
 * applied), x right, y down, measured in PDF points at the page's native
 * (unrotated) scale.
 *
 * When baking annotations into the final PDF we draw directly into the
 * page's *native* (unrotated) content stream and rely on the page's /Rotate
 * entry for on-screen display — this matches how Acrobat itself rotates
 * pages (metadata flag, not re-rendered content) and keeps text selectable.
 * That means every annotation point must be converted from display space
 * back into native PDF space (origin bottom-left, y up), accounting for the
 * page rotation.
 *
 * Derivation (r = clockwise rotation applied for display, native page is
 * W x H unrotated):
 *   r=0:   X = x,      Y = H - y
 *   r=90:  X = y,      Y = x
 *   r=180: X = W - x,  Y = y
 *   r=270: X = W - y,  Y = H - x
 */
export function displayPointToNative(
  x: number,
  y: number,
  nativeWidth: number,
  nativeHeight: number,
  rotation: Rotation,
): { x: number; y: number } {
  switch (rotation) {
    case 0:
      return { x, y: nativeHeight - y };
    case 90:
      return { x: y, y: x };
    case 180:
      return { x: nativeWidth - x, y };
    case 270:
      return { x: nativeWidth - y, y: nativeHeight - x };
  }
}

/** Inverse of {@link displayPointToNative}: native PDF point -> display
 * point. Used to position HTML overlays (form field inputs) over a
 * pdf.js-rendered, already-rotated canvas. */
export function nativePointToDisplay(
  X: number,
  Y: number,
  nativeWidth: number,
  nativeHeight: number,
  rotation: Rotation,
): { x: number; y: number } {
  switch (rotation) {
    case 0:
      return { x: X, y: nativeHeight - Y };
    case 90:
      return { x: Y, y: X };
    case 180:
      return { x: nativeWidth - X, y: Y };
    case 270:
      return { x: nativeHeight - Y, y: nativeWidth - X };
  }
}

export function nativeRectToDisplay(
  X0: number,
  Y0: number,
  X1: number,
  Y1: number,
  nativeWidth: number,
  nativeHeight: number,
  rotation: Rotation,
) {
  const p1 = nativePointToDisplay(X0, Y0, nativeWidth, nativeHeight, rotation);
  const p2 = nativePointToDisplay(X1, Y1, nativeWidth, nativeHeight, rotation);
  return {
    x: Math.min(p1.x, p2.x),
    y: Math.min(p1.y, p2.y),
    width: Math.abs(p2.x - p1.x),
    height: Math.abs(p2.y - p1.y),
  };
}

/** Display-space size of a page once its rotation is applied. */
export function displaySize(
  nativeWidth: number,
  nativeHeight: number,
  rotation: Rotation,
): { width: number; height: number } {
  return rotation % 180 === 0
    ? { width: nativeWidth, height: nativeHeight }
    : { width: nativeHeight, height: nativeWidth };
}

/** Convert a display-space axis-aligned rectangle into a native-space
 * axis-aligned rectangle (valid because rotations are multiples of 90°). */
export function displayRectToNative(
  x: number,
  y: number,
  width: number,
  height: number,
  nativeWidth: number,
  nativeHeight: number,
  rotation: Rotation,
) {
  const p1 = displayPointToNative(x, y, nativeWidth, nativeHeight, rotation);
  const p2 = displayPointToNative(
    x + width,
    y + height,
    nativeWidth,
    nativeHeight,
    rotation,
  );
  return {
    x: Math.min(p1.x, p2.x),
    y: Math.min(p1.y, p2.y),
    width: Math.abs(p2.x - p1.x),
    height: Math.abs(p2.y - p1.y),
  };
}

export function normalizeRotation(deg: number): Rotation {
  const r = ((deg % 360) + 360) % 360;
  return r as Rotation;
}

/** The page's fully-resolved display rotation: the source's own /Rotate
 * value plus whatever the user has additionally applied in-app. */
export function pageTotalRotation(page: PageRef): Rotation {
  return normalizeRotation(page.baseRotation + page.rotation);
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Shared between the editing overlay (AnnotationShape) and the PDF export
 * pass (pdfDraw's drawDisplayText) so a text annotation's box always
 * matches what actually gets baked into the PDF. */
export const TEXT_LINE_HEIGHT_FACTOR = 1.25;
export function textBoxHeight(fontSize: number, text: string): number {
  const lines = Math.max(1, text.split('\n').length);
  return lines * fontSize * TEXT_LINE_HEIGHT_FACTOR;
}

/** Parse a page-range string like "1-3,5,8-10" into a 0-based, deduped,
 * sorted array of page indices. `total` bounds the range. Empty/invalid
 * input yields all pages. */
export function parsePageRange(input: string, total: number): number[] {
  const trimmed = input.trim();
  if (!trimmed) return Array.from({ length: total }, (_, i) => i);
  const out = new Set<number>();
  for (const part of trimmed.split(',')) {
    const seg = part.trim();
    if (!seg) continue;
    const m = seg.match(/^(\d+)\s*-\s*(\d+)$/);
    if (m) {
      let a = parseInt(m[1], 10);
      let b = parseInt(m[2], 10);
      if (a > b) [a, b] = [b, a];
      for (let i = a; i <= b; i++) {
        if (i >= 1 && i <= total) out.add(i - 1);
      }
    } else if (/^\d+$/.test(seg)) {
      const n = parseInt(seg, 10);
      if (n >= 1 && n <= total) out.add(n - 1);
    }
  }
  return Array.from(out).sort((a, b) => a - b);
}
