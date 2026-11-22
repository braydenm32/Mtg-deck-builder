/**
 * Minimal, dependency-free image helpers for the card scanner.
 *
 * Everything works on plain RGBA buffers (the same layout as the browser's
 * ImageData), so the same code runs in the browser, in a Web Worker and in
 * Node tests.
 */

export interface RGBAImage {
  width: number;
  height: number;
  /** RGBA, 4 bytes per pixel, row-major. */
  data: Uint8ClampedArray;
}

/** Single-channel 8-bit image (luma). */
export interface GrayImage {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A rectangle expressed as fractions (0..1) of some parent image. */
export type FractionRect = Rect;

export function createRGBA(width: number, height: number): RGBAImage {
  return { width, height, data: new Uint8ClampedArray(width * height * 4) };
}

export function createGray(width: number, height: number): GrayImage {
  return { width, height, data: new Uint8ClampedArray(width * height) };
}

/** Converts a fractional rect into a pixel rect clamped to the image. */
export function toPixelRect(img: { width: number; height: number }, f: FractionRect): Rect {
  const x = clamp(Math.round(f.x * img.width), 0, img.width - 1);
  const y = clamp(Math.round(f.y * img.height), 0, img.height - 1);
  const width = clamp(Math.round(f.width * img.width), 1, img.width - x);
  const height = clamp(Math.round(f.height * img.height), 1, img.height - y);
  return { x, y, width, height };
}

export function crop<T extends RGBAImage | GrayImage>(img: T, r: Rect): T {
  const channels = img.data.length / (img.width * img.height);
  const x0 = clamp(Math.round(r.x), 0, img.width - 1);
  const y0 = clamp(Math.round(r.y), 0, img.height - 1);
  const w = clamp(Math.round(r.width), 1, img.width - x0);
  const h = clamp(Math.round(r.height), 1, img.height - y0);
  const out = new Uint8ClampedArray(w * h * channels);
  for (let y = 0; y < h; y++) {
    const src = ((y0 + y) * img.width + x0) * channels;
    out.set(img.data.subarray(src, src + w * channels), y * w * channels);
  }
  return { width: w, height: h, data: out } as T;
}

export function cropFraction<T extends RGBAImage | GrayImage>(img: T, f: FractionRect): T {
  return crop(img, toPixelRect(img, f));
}

/** ITU-R BT.601 luma. */
export function toGray(img: RGBAImage): GrayImage {
  const out = createGray(img.width, img.height);
  const d = img.data;
  for (let i = 0, j = 0; j < out.data.length; i += 4, j++) {
    out.data[j] = (d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000;
  }
  return out;
}

/**
 * Per-pixel minimum of R, G and B. Light text on a coloured background stays
 * light while the background goes dark, which gives much better contrast than
 * luma for white or cream text on coloured title bars.
 */
export function minChannel(img: RGBAImage): GrayImage {
  const out = createGray(img.width, img.height);
  const d = img.data;
  for (let i = 0, j = 0; j < out.data.length; i += 4, j++) out.data[j] = Math.min(d[i], d[i + 1], d[i + 2]);
  return out;
}

/** Per-pixel maximum of R, G and B: dark text on a coloured background gains contrast. */
export function maxChannel(img: RGBAImage): GrayImage {
  const out = createGray(img.width, img.height);
  const d = img.data;
  for (let i = 0, j = 0; j < out.data.length; i += 4, j++) out.data[j] = Math.max(d[i], d[i + 1], d[i + 2]);
  return out;
}

/**
 * Bilinear resize. When shrinking by more than 2x it box-filters first so
 * small text and hashes don't alias.
 */
export function resizeGray(img: GrayImage, width: number, height: number): GrayImage {
  let src = img;
  while (src.width >= width * 2 && src.height >= height * 2) src = halveGray(src);
  const out = createGray(width, height);
  const sx = src.width / width;
  const sy = src.height / height;
  for (let y = 0; y < height; y++) {
    const fy = Math.max(0, (y + 0.5) * sy - 0.5);
    const y0 = Math.min(src.height - 1, Math.floor(fy));
    const y1 = Math.min(src.height - 1, y0 + 1);
    const wy = fy - y0;
    for (let x = 0; x < width; x++) {
      const fx = Math.max(0, (x + 0.5) * sx - 0.5);
      const x0 = Math.min(src.width - 1, Math.floor(fx));
      const x1 = Math.min(src.width - 1, x0 + 1);
      const wx = fx - x0;
      const a = src.data[y0 * src.width + x0];
      const b = src.data[y0 * src.width + x1];
      const c = src.data[y1 * src.width + x0];
      const d = src.data[y1 * src.width + x1];
      out.data[y * width + x] = (a * (1 - wx) + b * wx) * (1 - wy) + (c * (1 - wx) + d * wx) * wy;
    }
  }
  return out;
}

function halveGray(img: GrayImage): GrayImage {
  const w = Math.floor(img.width / 2);
  const h = Math.floor(img.height / 2);
  const out = createGray(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = 2 * y * img.width + 2 * x;
      out.data[y * w + x] =
        (img.data[i] + img.data[i + 1] + img.data[i + img.width] + img.data[i + img.width + 1]) / 4;
    }
  }
  return out;
}

/** resizeGray for colour: bilinear, box-filtering first when shrinking by 2x or more. Alpha is set opaque. */
export function resizeRGBA(img: RGBAImage, width: number, height: number): RGBAImage {
  let src = img;
  while (src.width >= width * 2 && src.height >= height * 2) src = halveRGBA(src);
  const out = createRGBA(width, height);
  const sx = src.width / width;
  const sy = src.height / height;
  const sw = src.width;
  const d = src.data;
  for (let y = 0; y < height; y++) {
    const fy = Math.max(0, (y + 0.5) * sy - 0.5);
    const y0 = Math.min(src.height - 1, Math.floor(fy));
    const y1 = Math.min(src.height - 1, y0 + 1);
    const wy = fy - y0;
    for (let x = 0; x < width; x++) {
      const fx = Math.max(0, (x + 0.5) * sx - 0.5);
      const x0 = Math.min(sw - 1, Math.floor(fx));
      const x1 = Math.min(sw - 1, x0 + 1);
      const wx = fx - x0;
      const a = (y0 * sw + x0) * 4;
      const b = (y0 * sw + x1) * 4;
      const c = (y1 * sw + x0) * 4;
      const e = (y1 * sw + x1) * 4;
      const o = (y * width + x) * 4;
      for (let k = 0; k < 3; k++) {
        out.data[o + k] = (d[a + k] * (1 - wx) + d[b + k] * wx) * (1 - wy) + (d[c + k] * (1 - wx) + d[e + k] * wx) * wy;
      }
      out.data[o + 3] = 255;
    }
  }
  return out;
}

function halveRGBA(img: RGBAImage): RGBAImage {
  const w = Math.floor(img.width / 2);
  const h = Math.floor(img.height / 2);
  const out = createRGBA(w, h);
  const row = img.width * 4;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (2 * y * img.width + 2 * x) * 4;
      const o = (y * w + x) * 4;
      for (let k = 0; k < 4; k++) out.data[o + k] = (img.data[i + k] + img.data[i + 4 + k] + img.data[i + row + k] + img.data[i + row + 4 + k]) / 4;
    }
  }
  return out;
}

export function scaleGray(img: GrayImage, factor: number): GrayImage {
  return resizeGray(img, Math.max(1, Math.round(img.width * factor)), Math.max(1, Math.round(img.height * factor)));
}

export function invertGray(img: GrayImage): GrayImage {
  const out = createGray(img.width, img.height);
  for (let i = 0; i < img.data.length; i++) out.data[i] = 255 - img.data[i];
  return out;
}

export function rotate180<T extends RGBAImage | GrayImage>(img: T): T {
  const channels = img.data.length / (img.width * img.height);
  const out = new Uint8ClampedArray(img.data.length);
  const n = img.width * img.height;
  for (let p = 0; p < n; p++) {
    const q = n - 1 - p;
    for (let c = 0; c < channels; c++) out[q * channels + c] = img.data[p * channels + c];
  }
  return { width: img.width, height: img.height, data: out } as T;
}

/** Linear stretch so the 2nd..98th percentile spans 0..255. */
export function stretchContrast(img: GrayImage, lowPct = 0.02, highPct = 0.98): GrayImage {
  const hist = histogram(img);
  const n = img.data.length;
  let lo = 0;
  let hi = 255;
  for (let acc = 0, v = 0; v < 256; v++) {
    acc += hist[v];
    if (acc >= n * lowPct) {
      lo = v;
      break;
    }
  }
  for (let acc = 0, v = 255; v >= 0; v--) {
    acc += hist[v];
    if (acc >= n * (1 - highPct)) {
      hi = v;
      break;
    }
  }
  const out = createGray(img.width, img.height);
  const range = Math.max(1, hi - lo);
  for (let i = 0; i < n; i++) out.data[i] = ((img.data[i] - lo) * 255) / range;
  return out;
}

export function histogram(img: GrayImage): Uint32Array {
  const hist = new Uint32Array(256);
  for (let i = 0; i < img.data.length; i++) hist[img.data[i]]++;
  return hist;
}

export function meanGray(img: GrayImage): number {
  let s = 0;
  for (let i = 0; i < img.data.length; i++) s += img.data[i];
  return s / img.data.length;
}

/** Otsu's threshold. */
export function otsuThreshold(img: GrayImage): number {
  const hist = histogram(img);
  const total = img.data.length;
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sumB = 0;
  let wB = 0;
  let best = 0;
  let threshold = 127;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > best) {
      best = between;
      threshold = t;
    }
  }
  return threshold;
}

/**
 * Makes a grayscale crop read as dark text on a light background, which is
 * what Tesseract's LSTM model is trained on. Light text (e.g. the collector
 * line on black-bordered cards, or white names on some showcase frames) gets
 * inverted. Decided by whether the darker or lighter Otsu class is the
 * minority (text is the minority of pixels).
 */
export function normalizePolarity(img: GrayImage): GrayImage {
  const t = otsuThreshold(img);
  let dark = 0;
  for (let i = 0; i < img.data.length; i++) if (img.data[i] <= t) dark++;
  return dark > img.data.length / 2 ? invertGray(img) : img;
}

/** Encodes an 8-bit grayscale image as a BMP file (palette, bottom-up). */
export function encodeGrayBMP(img: GrayImage): Uint8Array {
  const rowSize = (img.width + 3) & ~3;
  const pixelBytes = rowSize * img.height;
  const headerSize = 14 + 40 + 256 * 4;
  const buf = new Uint8Array(headerSize + pixelBytes);
  const dv = new DataView(buf.buffer);
  buf[0] = 0x42; // B
  buf[1] = 0x4d; // M
  dv.setUint32(2, buf.length, true);
  dv.setUint32(10, headerSize, true);
  dv.setUint32(14, 40, true);
  dv.setInt32(18, img.width, true);
  dv.setInt32(22, img.height, true);
  dv.setUint16(26, 1, true);
  dv.setUint16(28, 8, true);
  dv.setUint32(34, pixelBytes, true);
  dv.setInt32(38, 2835, true); // 72 dpi
  dv.setInt32(42, 2835, true);
  dv.setUint32(46, 256, true);
  for (let i = 0; i < 256; i++) {
    const o = 54 + i * 4;
    buf[o] = i;
    buf[o + 1] = i;
    buf[o + 2] = i;
  }
  for (let y = 0; y < img.height; y++) {
    const dst = headerSize + (img.height - 1 - y) * rowSize;
    buf.set(img.data.subarray(y * img.width, (y + 1) * img.width), dst);
  }
  return buf;
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
