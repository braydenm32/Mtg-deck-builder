/**
 * Finds roughly where a card is in a photo, anywhere in the frame.
 *
 * detectCard() fits the card's edges precisely, but only near a guide box. In
 * an uploaded photo the card can sit anywhere and fill a third of the frame,
 * so this first finds the card as a blob that stands out from the table:
 *
 *   1. Shrink the photo and estimate the background from the frame's border.
 *   2. Mark pixels that differ from it (colour, brightness or local detail).
 *   3. Close small gaps, take connected blobs, and score each one on size,
 *      card shape and how solidly it fills its box.
 *
 * Paper notes, fingers and table clutter lose on shape or solidity. The
 * result is a guide rect for detectCard(), which then finds the true edges.
 */
import { CARD_ASPECT, type CardDetection, detectCard, type Point, type Quad } from './geometry';
import { crop, type RGBAImage, type Rect } from './image';

const WORK = 240; // long side of the working image

export interface LocatedCard {
  /** Axis-aligned box around the card, in frame pixels. */
  rect: Rect;
  /** Smallest rotated rectangle around the card blob (TL, TR, BR, BL), in frame pixels. */
  quad: Quad;
  /** 0..1, how card-like the winning blob was. */
  score: number;
}

export function locateCard(frame: RGBAImage): LocatedCard | null {
  const { mask, w, h, scale } = foregroundMask(frame);
  let best = bestBlob(mask, w, h);
  // A hand or sleeve touching the card merges into one blob; cutting thin
  // bridges (an opening) usually frees the card.
  for (const r of [2, 4]) {
    if (best && best.score >= 0.6) break;
    const opened = dilate(erode(mask, w, h, r), w, h, r);
    const alt = bestBlob(opened, w, h);
    if (alt && (!best || alt.score > best.score)) best = alt;
  }
  if (!best || best.score < 0.3) return null;
  const { blob, score } = best;
  let quad = minAreaRect(blob.boundary, w).map((p) => ({ x: p.x / scale, y: p.y / scale })) as Quad;
  // A card lying sideways: start the corners at the bottom-left so the
  // flattened image comes out portrait (reading handles the other way up).
  if (dist(quad[0], quad[1]) > dist(quad[0], quad[3])) quad = [quad[3], quad[0], quad[1], quad[2]];
  return {
    score,
    quad,
    rect: { x: blob.x0 / scale, y: blob.y0 / scale, width: (blob.x1 - blob.x0 + 1) / scale, height: (blob.y1 - blob.y0 + 1) / scale },
  };
}

/**
 * Finds the card anywhere in the photo: locate the blob, then fit its edges
 * precisely in a crop around it. If the edge fit disagrees with the blob
 * (it latched onto a note or a shadow), the blob's own rectangle is used.
 */
export function detectCardAnywhere(frame: RGBAImage): CardDetection | null {
  const loc = locateCard(frame);
  if (!loc) return null;
  const q = loc.quad;
  const cardW = (dist(q[0], q[1]) + dist(q[3], q[2])) / 2;
  const cardH = (dist(q[0], q[3]) + dist(q[1], q[2])) / 2;
  const cx = (q[0].x + q[1].x + q[2].x + q[3].x) / 4;
  const cy = (q[0].y + q[1].y + q[2].y + q[3].y) / 4;
  const fallback: CardDetection = { quad: q, confidence: loc.score * 0.8, usedGuide: false };

  // Work on a crop around the card so the edge fit sees it at full resolution.
  const margin = 0.2;
  const box = {
    x: Math.max(0, Math.floor(loc.rect.x - loc.rect.width * margin)),
    y: Math.max(0, Math.floor(loc.rect.y - loc.rect.height * margin)),
    width: 0,
    height: 0,
  };
  box.width = Math.min(frame.width - box.x, Math.ceil(loc.rect.width * (1 + 2 * margin)));
  box.height = Math.min(frame.height - box.y, Math.ceil(loc.rect.height * (1 + 2 * margin)));
  const sub = crop(frame, box);
  // Only portrait cards go to the edge fitter (its guide and checks assume it).
  if (cardW > cardH) return fallback;
  const guide = { x: cx - box.x - cardW / 2, y: cy - box.y - cardH / 2, width: cardW, height: cardH };
  const d = detectCard(sub, guide, { band: 0.05, nearest: true });
  if (d.usedGuide) return fallback;
  const quad = d.quad.map((p) => ({ x: p.x + box.x, y: p.y + box.y })) as Quad;
  // Corners must agree with the blob's rectangle to within 4% of the card's diagonal.
  const tol = 0.04 * Math.hypot(cardW, cardH);
  if (quad.some((p, i) => dist(p, q[i]) > tol)) return fallback;
  return { quad, confidence: d.confidence, usedGuide: false };
}

function dist(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function bestBlob(mask: Uint8Array, w: number, h: number): { blob: Blob; score: number } | null {
  let best: { blob: Blob; score: number } | null = null;
  for (const blob of components(mask, w, h)) {
    const areaFrac = blob.area / (w * h);
    if (areaFrac < 0.02) continue;
    const box = minAreaRect(blob.boundary, w);
    const side1 = Math.hypot(box[1].x - box[0].x, box[1].y - box[0].y);
    const side2 = Math.hypot(box[3].x - box[0].x, box[3].y - box[0].y);
    const aspect = Math.min(side1, side2) / Math.max(side1, side2, 1);
    const aspectFit = Math.max(0, 1 - Math.abs(aspect - CARD_ASPECT) / 0.25);
    const solidity = blob.area / Math.max(1, side1 * side2);
    const touchesEdge = blob.x0 <= 0 || blob.y0 <= 0 || blob.x1 >= w - 1 || blob.y1 >= h - 1;
    const score = aspectFit * Math.min(1, solidity / 0.9) * Math.sqrt(Math.min(1, areaFrac / 0.12)) * (touchesEdge ? 0.5 : 1);
    if (!best || score > best.score) best = { blob, score };
  }
  return best;
}

/**
 * Smallest-area rectangle around the given pixels, trying rotations up to
 * ±20°. Returns corners TL, TR, BR, BL (image coordinates, y down), with the
 * card's long side vertical (cards lying sideways come back as portrait).
 */
function minAreaRect(points: number[], w: number): Quad {
  let best: { area: number; a: number; u0: number; u1: number; v0: number; v1: number } | null = null;
  for (let deg = -20; deg <= 20; deg += 0.5) {
    const a = (deg * Math.PI) / 180;
    const c = Math.cos(a);
    const s = Math.sin(a);
    let u0 = Infinity;
    let u1 = -Infinity;
    let v0 = Infinity;
    let v1 = -Infinity;
    for (const i of points) {
      const x = (i % w) + 0.5;
      const y = Math.floor(i / w) + 0.5;
      const u = x * c + y * s;
      const v = -x * s + y * c;
      if (u < u0) u0 = u;
      if (u > u1) u1 = u;
      if (v < v0) v0 = v;
      if (v > v1) v1 = v;
    }
    // Pixel centres: widen by half a pixel on each side.
    const area = (u1 - u0 + 1) * (v1 - v0 + 1);
    if (!best || area < best.area) best = { area, a, u0: u0 - 0.5, u1: u1 + 0.5, v0: v0 - 0.5, v1: v1 + 0.5 };
  }
  const { a, u0, u1, v0, v1 } = best!;
  const c = Math.cos(a);
  const s = Math.sin(a);
  const back = (u: number, v: number): Point => ({ x: u * c - v * s, y: u * s + v * c });
  return [back(u0, v0), back(u1, v0), back(u1, v1), back(u0, v1)];
}

/**
 * Marks pixels that don't look like the table. The background is modelled
 * from a ring around the frame as a smooth (quadratic) brightness surface, so
 * uneven lighting and vignetting don't read as "card".
 */
export function foregroundMask(frame: RGBAImage): { mask: Uint8Array; w: number; h: number; scale: number } {
  const scale = Math.min(1, WORK / Math.max(frame.width, frame.height));
  const w = Math.max(8, Math.round(frame.width * scale));
  const h = Math.max(8, Math.round(frame.height * scale));
  const { L, S } = smallLabSat(frame, w, h);

  const m = Math.max(2, Math.round(Math.min(w, h) * 0.07));
  const ringIdx: number[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (x >= m && x < w - m && y >= m && y < h - m) continue;
      ringIdx.push(y * w + x);
    }
  }
  const surface = fitSurface(L, w, h, ringIdx);
  const resid = (i: number) => L[i] - surface[i];
  const madL = Math.max(3, median(ringIdx.map((i) => Math.abs(resid(i)))));
  const ringS = ringIdx.map((i) => S[i]);
  const bgS = median(ringS);
  const madS = Math.max(3, median(ringS.map((v) => Math.abs(v - bgS))));

  // Local detail: max-min luma in a 3x3 window.
  const detail = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      let lo = 255;
      let hi = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const v = L[(y + dy) * w + x + dx];
          if (v < lo) lo = v;
          if (v > hi) hi = v;
        }
      }
      detail[y * w + x] = hi - lo;
    }
  }
  const ringDetail = ringIdx.map((i) => detail[i]);
  const bgDetail = median(ringDetail);
  const madDetail = Math.max(2, median(ringDetail.map((v) => Math.abs(v - bgDetail))));

  const raw = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const dl = Math.abs(resid(i)) / madL;
    const ds = (S[i] - bgS) / madS;
    const dd = (detail[i] - bgDetail) / madDetail;
    if (dl > 6 || ds > 6 || dd > 8) raw[i] = 1;
  }

  // Close (dilate then erode) to join the card's parts, then fill holes.
  const r = Math.max(1, Math.round(Math.min(w, h) * 0.012));
  const mask = erode(dilate(raw, w, h, r), w, h, r);
  fillHoles(mask, w, h);
  return { mask, w, h, scale };
}

/** Robust least-squares fit of a quadratic surface to L at the given pixels. */
function fitSurface(L: Float32Array, w: number, h: number, idx: number[]): Float32Array {
  const basis = (x: number, y: number) => {
    const u = x / w - 0.5;
    const v = y / h - 0.5;
    return [1, u, v, u * u, v * v, u * v];
  };
  let use = idx;
  let coef = [median(idx.map((i) => L[i])), 0, 0, 0, 0, 0];
  for (let pass = 0; pass < 3; pass++) {
    const A = Array.from({ length: 6 }, () => new Array(6).fill(0));
    const B = new Array(6).fill(0);
    for (const i of use) {
      const x = i % w;
      const f = basis(x, (i - x) / w);
      for (let a = 0; a < 6; a++) {
        B[a] += f[a] * L[i];
        for (let b = 0; b < 6; b++) A[a][b] += f[a] * f[b];
      }
    }
    const solved = solve6(A, B);
    if (!solved) break;
    coef = solved;
    const res = idx.map((i) => {
      const x = i % w;
      const f = basis(x, (i - x) / w);
      return Math.abs(L[i] - f.reduce((s, v, k) => s + v * coef[k], 0));
    });
    const mad = Math.max(2, median(res));
    use = idx.filter((_, k) => res[k] < mad * 3);
  }
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const f = basis(x, y);
      out[y * w + x] = f.reduce((s, v, k) => s + v * coef[k], 0);
    }
  }
  return out;
}

function solve6(A: number[][], B: number[]): number[] | null {
  const n = B.length;
  const M = A.map((row, i) => [...row, B[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) < 1e-9) return null;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r][c] / M[c][c];
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  return M.map((row, i) => row[n] / row[i]);
}

/** Luma and a simple saturation (max-min channel), box-downscaled. */
function smallLabSat(img: RGBAImage, w: number, h: number): { L: Float32Array; S: Float32Array } {
  const L = new Float32Array(w * h);
  const S = new Float32Array(w * h);
  const sx = img.width / w;
  const sy = img.height / h;
  for (let y = 0; y < h; y++) {
    const y0 = Math.floor(y * sy);
    const y1 = Math.max(y0 + 1, Math.floor((y + 1) * sy));
    for (let x = 0; x < w; x++) {
      const x0 = Math.floor(x * sx);
      const x1 = Math.max(x0 + 1, Math.floor((x + 1) * sx));
      let r = 0;
      let g = 0;
      let b = 0;
      let n = 0;
      // Sample a sparse grid inside the cell; enough for a blob map.
      const stepY = Math.max(1, Math.floor((y1 - y0) / 3));
      const stepX = Math.max(1, Math.floor((x1 - x0) / 3));
      for (let yy = y0; yy < y1; yy += stepY) {
        for (let xx = x0; xx < x1; xx += stepX) {
          const i = (yy * img.width + xx) * 4;
          r += img.data[i];
          g += img.data[i + 1];
          b += img.data[i + 2];
          n++;
        }
      }
      r /= n;
      g /= n;
      b /= n;
      L[y * w + x] = 0.299 * r + 0.587 * g + 0.114 * b;
      S[y * w + x] = Math.max(r, g, b) - Math.min(r, g, b);
    }
  }
  return { L, S };
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

function dilate(src: Uint8Array, w: number, h: number, r: number): Uint8Array {
  return morph(src, w, h, r, 1);
}

function erode(src: Uint8Array, w: number, h: number, r: number): Uint8Array {
  return morph(src, w, h, r, 0);
}

/** Separable square min/max filter. `target` is the value that spreads. */
function morph(src: Uint8Array, w: number, h: number, r: number, target: 0 | 1): Uint8Array {
  const tmp = new Uint8Array(w * h);
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let v = 1 - target;
      for (let dx = -r; dx <= r && v !== target; dx++) {
        const xx = x + dx;
        if (xx >= 0 && xx < w && src[y * w + xx] === target) v = target;
      }
      tmp[y * w + x] = v;
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let v = 1 - target;
      for (let dy = -r; dy <= r && v !== target; dy++) {
        const yy = y + dy;
        if (yy >= 0 && yy < h && tmp[yy * w + x] === target) v = target;
      }
      out[y * w + x] = v;
    }
  }
  return out;
}

/** Sets every 0-region not connected to the border to 1. */
function fillHoles(mask: Uint8Array, w: number, h: number): void {
  const outside = new Uint8Array(w * h);
  const stack: number[] = [];
  const push = (i: number) => {
    if (!mask[i] && !outside[i]) {
      outside[i] = 1;
      stack.push(i);
    }
  };
  for (let x = 0; x < w; x++) {
    push(x);
    push((h - 1) * w + x);
  }
  for (let y = 0; y < h; y++) {
    push(y * w);
    push(y * w + w - 1);
  }
  while (stack.length) {
    const i = stack.pop()!;
    const x = i % w;
    const y = (i - x) / w;
    if (x > 0) push(i - 1);
    if (x < w - 1) push(i + 1);
    if (y > 0) push(i - w);
    if (y < h - 1) push(i + w);
  }
  for (let i = 0; i < w * h; i++) if (!outside[i]) mask[i] = 1;
}

interface Blob {
  area: number;
  /** Pixel indices on the blob's outline. */
  boundary: number[];
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

function components(mask: Uint8Array, w: number, h: number): Blob[] {
  const seen = new Uint8Array(w * h);
  const blobs: Blob[] = [];
  const stack: number[] = [];
  for (let start = 0; start < w * h; start++) {
    if (!mask[start] || seen[start]) continue;
    const blob: Blob = { area: 0, boundary: [], x0: w, y0: h, x1: 0, y1: 0 };
    seen[start] = 1;
    stack.push(start);
    while (stack.length) {
      const i = stack.pop()!;
      const x = i % w;
      const y = (i - x) / w;
      blob.area++;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1 || !mask[i - 1] || !mask[i + 1] || !mask[i - w] || !mask[i + w]) {
        blob.boundary.push(i);
      }
      if (x < blob.x0) blob.x0 = x;
      if (x > blob.x1) blob.x1 = x;
      if (y < blob.y0) blob.y0 = y;
      if (y > blob.y1) blob.y1 = y;
      const visit = (j: number) => {
        if (mask[j] && !seen[j]) {
          seen[j] = 1;
          stack.push(j);
        }
      };
      if (x > 0) visit(i - 1);
      if (x < w - 1) visit(i + 1);
      if (y > 0) visit(i - w);
      if (y < h - 1) visit(i + w);
    }
    blobs.push(blob);
  }
  return blobs;
}
