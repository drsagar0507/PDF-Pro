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

function otsuFromHistogram(hist: number[], total: number): number {
  let sumAll = 0;
  for (let t = 0; t < 256; t++) sumAll += t * hist[t];
  let sumB = 0;
  let wB = 0;
  let best = 128;
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
  return best;
}

/** Light unsharp mask: out = orig + amount * (orig - blur(orig)). Cheap
 * separable-ish box blur stand-in for a Gaussian, applied per channel. */
function unsharpMask(data: Uint8ClampedArray, w: number, h: number, amount: number) {
  const blurred = new Uint8ClampedArray(data.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      for (let c = 0; c < 3; c++) {
        let sum = 0;
        let count = 0;
        for (let dy = -1; dy <= 1; dy++) {
          const yy = y + dy;
          if (yy < 0 || yy >= h) continue;
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx;
            if (xx < 0 || xx >= w) continue;
            sum += data[(yy * w + xx) * 4 + c];
            count++;
          }
        }
        blurred[(y * w + x) * 4 + c] = sum / count;
      }
    }
  }
  for (let i = 0; i < data.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      const orig = data[i + c];
      const blur = blurred[i + c];
      data[i + c] = Math.min(255, Math.max(0, orig + amount * (orig - blur)));
    }
  }
}

/**
 * Enhances a captured document photo in place: corrects color cast from
 * indoor/tungsten lighting (gray-world white balance anchored to the
 * brightest — presumably paper — pixels), stretches contrast using
 * percentile clipping (robust to a few blown-out or crushed outlier
 * pixels), and lightly sharpens. `bw` mode binarizes with an automatic
 * (Otsu) threshold instead of a fixed cutoff, so it adapts to how dark or
 * bright the actual scan turned out.
 */
export function enhanceScan(canvas: HTMLCanvasElement, filter: ScanFilter): HTMLCanvasElement {
  const ctx = canvas.getContext('2d')!;
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = img.data;
  const pixelCount = d.length / 4;

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
    const grayHist = new Array(256).fill(0);
    const grayVals = new Float32Array(pixelCount);
    for (let i = 0, p = 0; i < d.length; i += 4, p++) {
      const g = luminance(d[i], d[i + 1], d[i + 2]);
      grayVals[p] = g;
      grayHist[Math.round(g)]++;
    }
    const t = otsuFromHistogram(grayHist, pixelCount);
    for (let i = 0, p = 0; i < d.length; i += 4, p++) {
      const v = grayVals[p] >= t ? 255 : 0;
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

  unsharpMask(d, canvas.width, canvas.height, 0.35);

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
