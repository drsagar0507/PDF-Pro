export interface Point {
  x: number;
  y: number;
}

/**
 * Classic "unit-square to quadrilateral" projective mapping (Heckbert).
 * Returns a 3x3 matrix M such that M * (u, v, 1)^T = (x, y, w)^T maps the
 * unit square [0,1]x[0,1] onto the quad `p` (given as TL, TR, BR, BL),
 * with the actual point being (x/w, y/w).
 */
function squareToQuad(p: [Point, Point, Point, Point]): number[] {
  const [p0, p1, p2, p3] = p;
  const dx1 = p1.x - p2.x;
  const dx2 = p3.x - p2.x;
  const dx3 = p0.x - p1.x + p2.x - p3.x;
  const dy1 = p1.y - p2.y;
  const dy2 = p3.y - p2.y;
  const dy3 = p0.y - p1.y + p2.y - p3.y;

  let a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number;
  const i = 1;

  if (Math.abs(dx3) < 1e-9 && Math.abs(dy3) < 1e-9) {
    a = p1.x - p0.x;
    b = p2.x - p1.x;
    c = p0.x;
    d = p1.y - p0.y;
    e = p2.y - p1.y;
    f = p0.y;
    g = 0;
    h = 0;
  } else {
    const denom = dx1 * dy2 - dx2 * dy1;
    g = (dx3 * dy2 - dx2 * dy3) / denom;
    h = (dx1 * dy3 - dx3 * dy1) / denom;
    a = p1.x - p0.x + g * p1.x;
    b = p3.x - p0.x + h * p3.x;
    c = p0.x;
    d = p1.y - p0.y + g * p1.y;
    e = p3.y - p0.y + h * p3.y;
    f = p0.y;
  }

  return [a, b, c, d, e, f, g, h, i];
}

/**
 * Straightens a photographed document: given the four corners of the page
 * as seen in `source` (in TL, TR, BR, BL order — however skewed by the
 * camera angle), produces a flat `outWidth` x `outHeight` canvas as if
 * shot head-on. Uses inverse mapping with bilinear sampling so the output
 * has no gaps.
 */
export function warpPerspective(
  source: HTMLCanvasElement,
  corners: [Point, Point, Point, Point],
  outWidth: number,
  outHeight: number,
): HTMLCanvasElement {
  const [a, b, c, d, e, f, g, h, i] = squareToQuad(corners);

  const srcCtx = source.getContext('2d')!;
  const srcData = srcCtx.getImageData(0, 0, source.width, source.height);
  const sw = source.width;
  const sh = source.height;

  const out = document.createElement('canvas');
  out.width = outWidth;
  out.height = outHeight;
  const outCtx = out.getContext('2d')!;
  const outData = outCtx.createImageData(outWidth, outHeight);

  const sample = (sx: number, sy: number, dstIdx: number) => {
    if (sx < 0 || sy < 0 || sx >= sw - 1 || sy >= sh - 1) {
      outData.data[dstIdx + 3] = 0;
      return;
    }
    const x0 = Math.floor(sx);
    const y0 = Math.floor(sy);
    const fx = sx - x0;
    const fy = sy - y0;
    const i00 = (y0 * sw + x0) * 4;
    const i10 = (y0 * sw + x0 + 1) * 4;
    const i01 = ((y0 + 1) * sw + x0) * 4;
    const i11 = ((y0 + 1) * sw + x0 + 1) * 4;
    for (let ch = 0; ch < 4; ch++) {
      const top = srcData.data[i00 + ch] * (1 - fx) + srcData.data[i10 + ch] * fx;
      const bottom = srcData.data[i01 + ch] * (1 - fx) + srcData.data[i11 + ch] * fx;
      outData.data[dstIdx + ch] = Math.round(top * (1 - fy) + bottom * fy);
    }
  };

  for (let y = 0; y < outHeight; y++) {
    const v = y / outHeight;
    for (let x = 0; x < outWidth; x++) {
      const u = x / outWidth;
      const w = g * u + h * v + i;
      const sx = (a * u + b * v + c) / w;
      const sy = (d * u + e * v + f) / w;
      sample(sx, sy, (y * outWidth + x) * 4);
    }
  }

  outCtx.putImageData(outData, 0, 0);
  return out;
}

export function quadArea(corners: [Point, Point, Point, Point]): number {
  let sum = 0;
  for (let i = 0; i < 4; i++) {
    const p1 = corners[i];
    const p2 = corners[(i + 1) % 4];
    sum += p1.x * p2.y - p2.x * p1.y;
  }
  return Math.abs(sum / 2);
}
