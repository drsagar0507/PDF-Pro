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

/** Light median-ish denoise: a 3x3 blur blended partially with the
 * original, applied before sharpening so the sharpen pass amplifies real
 * edges instead of sensor/JPEG noise. */
function denoiseChannel(data: Uint8ClampedArray, w: number, h: number, amount: number) {
  for (let c = 0; c < 3; c++) {
    const channel = new Float32Array(w * h);
    for (let p = 0, i = c; p < w * h; p++, i += 4) channel[p] = data[i];
    const smoothed = boxBlurChannel(channel, w, h, 1);
    for (let p = 0, i = c; p < w * h; p++, i += 4) {
      data[i] = channel[p] * (1 - amount) + smoothed[p] * amount;
    }
  }
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

function integralSum(values: Float32Array, w: number, h: number): Float64Array {
  const stride = w + 1;
  const sum = new Float64Array(stride * (h + 1));
  for (let y = 0; y < h; y++) {
    let rowSum = 0;
    for (let x = 0; x < w; x++) {
      rowSum += values[y * w + x];
      sum[(y + 1) * stride + (x + 1)] = sum[y * stride + (x + 1)] + rowSum;
    }
  }
  return sum;
}

function windowSum(integral: Float64Array, stride: number, x0: number, y0: number, x1: number, y1: number): number {
  return (
    integral[(y1 + 1) * stride + (x1 + 1)] -
    integral[y0 * stride + (x1 + 1)] -
    integral[(y1 + 1) * stride + x0] +
    integral[y0 * stride + x0]
  );
}

/**
 * Shading correction / flat-fielding: estimates the slowly-varying paper
 * brightness across the page and divides it out, so the result reads as
 * evenly lit corner-to-corner — the way an actual flatbed scan looks —
 * instead of visibly brighter on one side the way a handheld photo under
 * one light source always is. Without this, contrast stretching alone
 * still leaves that gradient sitting right on top of the text.
 *
 * The estimate only counts pixels bright enough to plausibly be paper
 * (not ink) in each neighborhood's average — a naive blur gets dragged
 * down near any dense block of dark text, which paints a shadow-like halo
 * around paragraphs instead of a clean flat page.
 */
function flattenIllumination(data: Uint8ClampedArray, w: number, h: number) {
  const luma = new Float32Array(w * h);
  for (let p = 0, i = 0; p < w * h; p++, i += 4) luma[p] = luminance(data[i], data[i + 1], data[i + 2]);

  const hist = new Array(256).fill(0);
  for (let p = 0; p < luma.length; p++) hist[Math.max(0, Math.min(255, Math.round(luma[p])))]++;
  const paperCutoff = percentileFromHistogram(hist, luma.length, 45);

  const maskedLuma = new Float32Array(w * h);
  const mask = new Float32Array(w * h);
  for (let p = 0; p < luma.length; p++) {
    if (luma[p] >= paperCutoff) {
      maskedLuma[p] = luma[p];
      mask[p] = 1;
    }
  }
  const sumLuma = integralSum(maskedLuma, w, h);
  const sumMask = integralSum(mask, w, h);
  const stride = w + 1;

  const bgRadius = Math.max(24, Math.round(Math.min(w, h) / 7));
  const background = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - bgRadius);
    const y1 = Math.min(h - 1, y + bgRadius);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - bgRadius);
      const x1 = Math.min(w - 1, x + bgRadius);
      const sL = windowSum(sumLuma, stride, x0, y0, x1, y1);
      const sM = windowSum(sumMask, stride, x0, y0, x1, y1);
      // Fall back to the raw pixel if there's no plausible paper nearby
      // (e.g. deep inside a solid dark region) rather than divide by ~0.
      background[y * w + x] = sM > 6 ? sL / sM : luma[y * w + x];
    }
  }

  const bgHist = new Array(256).fill(0);
  for (let p = 0; p < background.length; p++) bgHist[Math.max(0, Math.min(255, Math.round(background[p])))]++;
  const reference = Math.max(60, percentileFromHistogram(bgHist, background.length, 95));

  for (let p = 0, i = 0; p < w * h; p++, i += 4) {
    const factor = reference / Math.max(8, background[p]);
    data[i] = Math.min(255, data[i] * factor);
    data[i + 1] = Math.min(255, data[i + 1] * factor);
    data[i + 2] = Math.min(255, data[i + 2] * factor);
  }
}

/** Summed-area tables (of values and of squared values) for O(1) local
 * mean + standard deviation lookups. */
function integralImages(gray: Float32Array, w: number, h: number): { sum: Float64Array; sumSq: Float64Array } {
  const stride = w + 1;
  const sum = new Float64Array(stride * (h + 1));
  const sumSq = new Float64Array(stride * (h + 1));
  for (let y = 0; y < h; y++) {
    let rowSum = 0;
    let rowSumSq = 0;
    for (let x = 0; x < w; x++) {
      const v = gray[y * w + x];
      rowSum += v;
      rowSumSq += v * v;
      sum[(y + 1) * stride + (x + 1)] = sum[y * stride + (x + 1)] + rowSum;
      sumSq[(y + 1) * stride + (x + 1)] = sumSq[y * stride + (x + 1)] + rowSumSq;
    }
  }
  return { sum, sumSq };
}

/**
 * Sauvola's adaptive threshold: like Bradley's method, judges each pixel
 * against its local neighborhood rather than one global cutoff — but also
 * factors in local *contrast* (standard deviation), so a truly flat, blank
 * patch of paper (low contrast) stays firmly classified as background even
 * if JPEG noise nudges a few pixels slightly darker, while genuine text
 * strokes (high local contrast against the paper) still binarize cleanly.
 * This is the standard, well-benchmarked method for document binarization
 * — a meaningful step up from plain Bradley for exactly the noise-in-
 * blank-areas failure mode that a fixed percentage threshold has.
 */
function sauvolaThreshold(gray: Float32Array, w: number, h: number): Uint8Array {
  const { sum, sumSq } = integralImages(gray, w, h);
  const stride = w + 1;
  const windowSize = Math.max(25, Math.round(Math.min(w, h) / 8));
  const half = Math.floor(windowSize / 2);
  const k = 0.34;
  const R = 128;

  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - half);
    const y1 = Math.min(h - 1, y + half);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - half);
      const x1 = Math.min(w - 1, x + half);
      const count = (x1 - x0 + 1) * (y1 - y0 + 1);
      const s =
        sum[(y1 + 1) * stride + (x1 + 1)] - sum[y0 * stride + (x1 + 1)] - sum[(y1 + 1) * stride + x0] + sum[y0 * stride + x0];
      const sq =
        sumSq[(y1 + 1) * stride + (x1 + 1)] - sumSq[y0 * stride + (x1 + 1)] - sumSq[(y1 + 1) * stride + x0] + sumSq[y0 * stride + x0];
      const mean = s / count;
      const variance = Math.max(0, sq / count - mean * mean);
      const stddev = Math.sqrt(variance);
      const threshold = mean * (1 + k * (stddev / R - 1));
      out[y * w + x] = gray[y * w + x] < threshold ? 1 : 0;
    }
  }
  return out;
}

/**
 * Enhances a captured document photo in place: flattens uneven lighting
 * (shading correction) so the page reads as evenly lit rather than
 * visibly brighter on one side, corrects color cast from indoor/tungsten
 * lighting (gray-world white balance), stretches contrast, denoises, and
 * sharpens at a radius matched to resolution. `bw` mode binarizes with
 * Sauvola's locally-adaptive, contrast-aware threshold so unevenly-lit,
 * slightly noisy scans still come out fully legible and clean.
 */
export function enhanceScan(canvas: HTMLCanvasElement, filter: ScanFilter): HTMLCanvasElement {
  const ctx = canvas.getContext('2d')!;
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = img.data;
  const pixelCount = d.length / 4;
  const sharpenRadius = Math.max(1, Math.round(Math.min(canvas.width, canvas.height) / 400));

  if (filter === 'bw') {
    const gray = new Float32Array(pixelCount);
    for (let i = 0, p = 0; i < d.length; i += 4, p++) {
      gray[p] = luminance(d[i], d[i + 1], d[i + 2]);
    }
    const ink = sauvolaThreshold(gray, canvas.width, canvas.height);
    for (let i = 0, p = 0; i < d.length; i += 4, p++) {
      const v = ink[p] ? 0 : 255;
      d[i] = d[i + 1] = d[i + 2] = v;
    }
    ctx.putImageData(img, 0, 0);
    return canvas;
  }

  flattenIllumination(d, canvas.width, canvas.height);

  const lumaHist = new Array(256).fill(0);
  let brightR = 0, brightG = 0, brightB = 0, brightCount = 0;
  for (let i = 0; i < d.length; i += 4) {
    const l = luminance(d[i], d[i + 1], d[i + 2]);
    lumaHist[Math.max(0, Math.min(255, Math.round(l)))]++;
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

  denoiseChannel(d, canvas.width, canvas.height, 0.25);
  unsharpMask(d, canvas.width, canvas.height, 0.7, sharpenRadius);

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
