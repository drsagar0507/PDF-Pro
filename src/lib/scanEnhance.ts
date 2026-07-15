export type ScanFilter = 'color' | 'grayscale' | 'bw';

function luminance(r: number, g: number, b: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

/** Value at the given percentile (0-100) of a 0-255 histogram. */
function percentileFromHistogram(hist: number[], total: number, percentile: number): number {
  const target = total * (percentile / 100);
  let acc = 0;
  for (let v = 0; v < 256; v++) {
    acc += hist[v];
    if (acc >= target) return v;
  }
  return 255;
}

/** O(w*h) sliding-window box blur (separable), independent of radius —
 * lets sharpening/local-contrast use a radius matched to the image's
 * actual resolution instead of a fixed tiny window that only touches
 * single-pixel noise. */
function boxBlurChannel(src: Float32Array, w: number, h: number, radius: number): Float32Array {
  if (radius < 1) return src.slice();
  const temp = new Float32Array(w * h);
  const out = new Float32Array(w * h);
  const win = radius * 2 + 1;

  for (let y = 0; y < h; y++) {
    const row = y * w;
    let sum = 0;
    for (let x = -radius; x <= radius; x++) sum += src[row + Math.min(w - 1, Math.max(0, x))];
    temp[row] = sum / win;
    for (let x = 1; x < w; x++) {
      const add = src[row + Math.min(w - 1, x + radius)];
      const sub = src[row + Math.max(0, x - radius - 1)];
      sum += add - sub;
      temp[row + x] = sum / win;
    }
  }

  for (let x = 0; x < w; x++) {
    let sum = 0;
    for (let y = -radius; y <= radius; y++) sum += temp[Math.min(h - 1, Math.max(0, y)) * w + x];
    out[x] = sum / win;
    for (let y = 1; y < h; y++) {
      const add = temp[Math.min(h - 1, y + radius) * w + x];
      const sub = temp[Math.max(0, y - radius - 1) * w + x];
      sum += add - sub;
      out[y * w + x] = sum / win;
    }
  }

  return out;
}

/** Unsharp mask with a radius scaled to image resolution — a fixed 1px
 * radius only ever touches per-pixel noise and does nothing perceptible
 * for actual character strokes at real photo resolution. */
function unsharpMask(data: Uint8ClampedArray, w: number, h: number, amount: number, radius: number) {
  for (let c = 0; c < 3; c++) {
    const channel = new Float32Array(w * h);
    for (let p = 0, i = c; p < w * h; p++, i += 4) channel[p] = data[i];
    const blurred = boxBlurChannel(channel, w, h, radius);
    for (let p = 0, i = c; p < w * h; p++, i += 4) {
      data[i] = Math.min(255, Math.max(0, channel[p] + amount * (channel[p] - blurred[p])));
    }
  }
}

/** Summed-area table for O(1) local-window sums. */
function integralImage(gray: Float32Array, w: number, h: number): Float64Array {
  const stride = w + 1;
  const integral = new Float64Array(stride * (h + 1));
  for (let y = 0; y < h; y++) {
    let rowSum = 0;
    for (let x = 0; x < w; x++) {
      rowSum += gray[y * w + x];
      integral[(y + 1) * stride + (x + 1)] = integral[y * stride + (x + 1)] + rowSum;
    }
  }
  return integral;
}

/**
 * Bradley/Wellner adaptive threshold: classifies each pixel as ink if it's
 * meaningfully darker than the *local* neighborhood average, rather than
 * one global cutoff for the whole page. A single global threshold (plain
 * Otsu) assumes uniform lighting, which real handheld photos essentially
 * never have — one corner is reliably brighter than another, and a global
 * cutoff either blacks out the dim side or blows out text on the bright
 * side. This is the standard technique real scanning apps use for exactly
 * this reason.
 */
function adaptiveThreshold(gray: Float32Array, w: number, h: number): Uint8Array {
  const integral = integralImage(gray, w, h);
  const stride = w + 1;
  const windowSize = Math.max(25, Math.round(Math.min(w, h) / 8));
  const half = Math.floor(windowSize / 2);
  const sensitivity = 0.85; // pixel must be < 85% of local mean to count as ink

  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - half);
    const y1 = Math.min(h - 1, y + half);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - half);
      const x1 = Math.min(w - 1, x + half);
      const count = (x1 - x0 + 1) * (y1 - y0 + 1);
      const sum =
        integral[(y1 + 1) * stride + (x1 + 1)] -
        integral[y0 * stride + (x1 + 1)] -
        integral[(y1 + 1) * stride + x0] +
        integral[y0 * stride + x0];
      const mean = sum / count;
      out[y * w + x] = gray[y * w + x] < mean * sensitivity ? 1 : 0;
    }
  }
  return out;
}

/**
 * Enhances a captured document photo in place: corrects color cast from
 * indoor/tungsten lighting (gray-world white balance anchored to the
 * brightest — presumably paper — pixels), stretches contrast using
 * percentile clipping (robust to a few blown-out or crushed outlier
 * pixels), and sharpens at a radius matched to resolution. `bw` mode
 * binarizes with a locally-adaptive threshold so unevenly-lit scans still
 * come out fully legible instead of losing text to shadow.
 */
export function enhanceScan(canvas: HTMLCanvasElement, filter: ScanFilter): HTMLCanvasElement {
  const ctx = canvas.getContext('2d')!;
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = img.data;
  const pixelCount = d.length / 4;
  const sharpenRadius = Math.max(1, Math.round(Math.min(canvas.width, canvas.height) / 400));

  const lumaHist = new Array(256).fill(0);
  let brightR = 0, brightG = 0, brightB = 0, brightCount = 0;
  for (let i = 0; i < d.length; i += 4) {
    const l = luminance(d[i], d[i + 1], d[i + 2]);
    lumaHist[Math.round(l)]++;
  }
  const brightThreshold = percentileFromHistogram(lumaHist, pixelCount, 90);
  for (let i = 0; i < d.length; i += 4) {
    const l = luminance(d[i], d[i + 1], d[i + 2]);
    if (l >= brightThreshold) {
      brightR += d[i];
      brightG += d[i + 1];
      brightB += d[i + 2];
      brightCount++;
    }
  }

  if (filter === 'bw') {
    const gray = new Float32Array(pixelCount);
    for (let i = 0, p = 0; i < d.length; i += 4, p++) {
      gray[p] = luminance(d[i], d[i + 1], d[i + 2]);
    }
    const ink = adaptiveThreshold(gray, canvas.width, canvas.height);
    for (let i = 0, p = 0; i < d.length; i += 4, p++) {
      const v = ink[p] ? 0 : 255;
      d[i] = d[i + 1] = d[i + 2] = v;
    }
    ctx.putImageData(img, 0, 0);
    return canvas;
  }

  // Gray-world white balance anchored to the brightest decile (the paper
  // background, in a well-framed document photo): scale each channel so
  // that region's average becomes neutral gray, removing color cast.
  let gainR = 1, gainG = 1, gainB = 1;
  if (brightCount > 0) {
    const avgR = brightR / brightCount;
    const avgG = brightG / brightCount;
    const avgB = brightB / brightCount;
    const targetGray = (avgR + avgG + avgB) / 3;
    gainR = avgR > 1 ? targetGray / avgR : 1;
    gainG = avgG > 1 ? targetGray / avgG : 1;
    gainB = avgB > 1 ? targetGray / avgB : 1;
    // Keep corrections modest so heavily-colored source material (e.g. a
    // photo, not a document) doesn't get pushed to a flat gray.
    gainR = clampGain(gainR);
    gainG = clampGain(gainG);
    gainB = clampGain(gainB);
  }

  const lo = percentileFromHistogram(lumaHist, pixelCount, 1);
  const hi = Math.max(lo + 1, percentileFromHistogram(lumaHist, pixelCount, 99));
  const range = hi - lo;

  for (let i = 0; i < d.length; i += 4) {
    let r = d[i] * gainR;
    let g = d[i + 1] * gainG;
    let b = d[i + 2] * gainB;
    r = ((r - lo) / range) * 255;
    g = ((g - lo) / range) * 255;
    b = ((b - lo) / range) * 255;
    d[i] = Math.min(255, Math.max(0, r));
    d[i + 1] = Math.min(255, Math.max(0, g));
    d[i + 2] = Math.min(255, Math.max(0, b));
  }

  unsharpMask(d, canvas.width, canvas.height, 0.6, sharpenRadius);

  if (filter === 'grayscale') {
    for (let i = 0; i < d.length; i += 4) {
      const g = luminance(d[i], d[i + 1], d[i + 2]);
      d[i] = d[i + 1] = d[i + 2] = g;
    }
  }

  ctx.putImageData(img, 0, 0);
  return canvas;
}

function clampGain(gain: number): number {
  return Math.min(1.35, Math.max(0.75, gain));
}
