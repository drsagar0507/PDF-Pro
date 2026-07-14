import type { Point } from './perspectiveWarp';

/**
 * Automatic document-boundary detection for the scanner, without pulling in
 * a full CV library. Pipeline: downsample -> grayscale -> blur -> Sobel
 * edge magnitude -> Otsu threshold -> convex hull of edge points -> minimum-
 * area rectangle via rotating calipers. This is the same class of classical
 * technique OpenCV's `minAreaRect` uses over a contour; here the "contour"
 * is just the raw edge-pixel point cloud, which is more robust to a messy
 * background than trying to trace a single closed contour by hand.
 *
 * Returns corners in TL, TR, BR, BL order as fractions (0-1) of the input
 * canvas's width/height, or null if no confident rectangle was found (the
 * caller should fall back to a generic inset default).
 */
export function detectDocumentQuad(
  source: HTMLCanvasElement,
): [Point, Point, Point, Point] | null {
  const workWidth = 360;
  const scale = workWidth / source.width;
  const workHeight = Math.max(1, Math.round(source.height * scale));

  const work = document.createElement('canvas');
  work.width = workWidth;
  work.height = workHeight;
  const ctx = work.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(source, 0, 0, workWidth, workHeight);
  const { data } = ctx.getImageData(0, 0, workWidth, workHeight);

  const gray = toGrayscale(data, workWidth, workHeight);
  const blurred = boxBlur3x3(gray, workWidth, workHeight);
  const mag = sobelMagnitude(blurred, workWidth, workHeight);
  const threshold = otsuThreshold(mag);

  const points: Point[] = [];
  // Ignore a thin border margin — camera vignetting / frame edges produce
  // spurious high-gradient pixels right at the image boundary.
  const margin = Math.round(Math.min(workWidth, workHeight) * 0.02);
  for (let y = margin; y < workHeight - margin; y++) {
    for (let x = margin; x < workWidth - margin; x++) {
      if (mag[y * workWidth + x] >= threshold) points.push({ x, y });
    }
  }

  if (points.length < 60) return null;

  const hull = convexHull(points);
  if (hull.length < 4) return null;

  const rect = minAreaRect(hull);
  const area = rect.width * rect.height;
  const frameArea = workWidth * workHeight;
  const fraction = area / frameArea;
  // Reject implausible results: too small to be a deliberately-framed
  // document, or so large it just traced the whole noisy frame.
  if (fraction < 0.12 || fraction > 0.97) return null;

  const [tl, tr, br, bl] = orderCorners(rect.corners);
  return [tl, tr, br, bl].map((p) => ({
    x: clamp01(p.x / workWidth),
    y: clamp01(p.y / workHeight),
  })) as [Point, Point, Point, Point];
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

function toGrayscale(data: Uint8ClampedArray, w: number, h: number): Float32Array {
  const out = new Float32Array(w * h);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    out[p] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  }
  return out;
}

function boxBlur3x3(src: Float32Array, w: number, h: number): Float32Array {
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sum = 0;
      let count = 0;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= h) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= w) continue;
          sum += src[yy * w + xx];
          count++;
        }
      }
      out[y * w + x] = sum / count;
    }
  }
  return out;
}

function sobelMagnitude(src: Float32Array, w: number, h: number): Float32Array {
  const out = new Float32Array(w * h);
  let maxMag = 1;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const gx =
        -src[i - w - 1] - 2 * src[i - 1] - src[i + w - 1] +
        src[i - w + 1] + 2 * src[i + 1] + src[i + w + 1];
      const gy =
        -src[i - w - 1] - 2 * src[i - w] - src[i - w + 1] +
        src[i + w - 1] + 2 * src[i + w] + src[i + w + 1];
      const m = Math.sqrt(gx * gx + gy * gy);
      out[i] = m;
      if (m > maxMag) maxMag = m;
    }
  }
  // Normalize to 0-255 so Otsu's histogram-based threshold applies cleanly.
  for (let i = 0; i < out.length; i++) out[i] = (out[i] / maxMag) * 255;
  return out;
}

function otsuThreshold(mag: Float32Array): number {
  const hist = new Array(256).fill(0);
  for (let i = 0; i < mag.length; i++) hist[Math.min(255, Math.round(mag[i]))]++;

  const total = mag.length;
  let sumAll = 0;
  for (let t = 0; t < 256; t++) sumAll += t * hist[t];

  let sumB = 0;
  let wB = 0;
  let best = 0;
  let bestVariance = -1;

  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sumAll - sumB) / wF;
    const variance = wB * wF * (mB - mF) * (mB - mF);
    if (variance > bestVariance) {
      bestVariance = variance;
      best = t;
    }
  }
  // Edge-magnitude images are dominated by low/flat values, so bias upward
  // from Otsu's midpoint to keep only genuinely strong edges.
  return Math.min(250, best * 1.15);
}

function convexHull(pts: Point[]): Point[] {
  const points = [...pts].sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (o: Point, a: Point, b: Point) =>
    (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

  const lower: Point[] = [];
  for (const p of points) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) {
      lower.pop();
    }
    lower.push(p);
  }
  const upper: Point[] = [];
  for (let i = points.length - 1; i >= 0; i--) {
    const p = points[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) {
      upper.pop();
    }
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

function minAreaRect(hull: Point[]): { corners: [Point, Point, Point, Point]; width: number; height: number } {
  let best: { area: number; corners: [Point, Point, Point, Point]; width: number; height: number } | null = null;
  const n = hull.length;

  for (let i = 0; i < n; i++) {
    const p1 = hull[i];
    const p2 = hull[(i + 1) % n];
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    const vx = -uy;
    const vy = ux;

    let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity;
    for (const p of hull) {
      const u = p.x * ux + p.y * uy;
      const v = p.x * vx + p.y * vy;
      if (u < minU) minU = u;
      if (u > maxU) maxU = u;
      if (v < minV) minV = v;
      if (v > maxV) maxV = v;
    }

    const width = maxU - minU;
    const height = maxV - minV;
    const area = width * height;
    if (!best || area < best.area) {
      const corners = [
        { u: minU, v: minV },
        { u: maxU, v: minV },
        { u: maxU, v: maxV },
        { u: minU, v: maxV },
      ].map(({ u, v }) => ({ x: u * ux + v * vx, y: u * uy + v * vy })) as [Point, Point, Point, Point];
      best = { area, corners, width, height };
    }
  }

  return best!;
}

/** Orders 4 arbitrary corners as TL, TR, BR, BL using the sum/diff trick
 * (TL/BR are the extreme points along x+y; TR/BL along x-y). Standard,
 * robust for quads not rotated past ~45°. */
function orderCorners(pts: [Point, Point, Point, Point]): [Point, Point, Point, Point] {
  const sum = (p: Point) => p.x + p.y;
  const diff = (p: Point) => p.x - p.y;
  const tl = pts.reduce((a, b) => (sum(a) < sum(b) ? a : b));
  const br = pts.reduce((a, b) => (sum(a) > sum(b) ? a : b));
  const tr = pts.reduce((a, b) => (diff(a) > diff(b) ? a : b));
  const bl = pts.reduce((a, b) => (diff(a) < diff(b) ? a : b));
  return [tl, tr, br, bl];
}
