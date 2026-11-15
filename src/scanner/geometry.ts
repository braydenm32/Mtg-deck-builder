/**
 * Finding the card in a camera frame and flattening it to a standard,
 * upright rectangle so the text and art regions land in known places.
 */
import { clamp, createGray, createRGBA, type GrayImage, type Rect, type RGBAImage, resizeGray, toGray } from './image';

export interface Point {
  x: number;
  y: number;
}

/** Corners in order: top-left, top-right, bottom-right, bottom-left. */
export type Quad = [Point, Point, Point, Point];

/** Physical card is 63 x 88 mm. */
export const CARD_ASPECT = 63 / 88;

/** Size of the flattened card the rest of the pipeline works on (~10 px/mm). */
export const CANON_WIDTH = 630;
export const CANON_HEIGHT = 880;

// ---------------------------------------------------------------------------
// Homography
// ---------------------------------------------------------------------------

/** 3x3 matrix, row-major, h[8] = 1. Maps (u, v) in the source to (x, y) in the destination. */
export type Homography = number[];

/** Solves the homography that maps each `from[i]` to `to[i]` (4 point pairs). */
export function solveHomography(from: Quad, to: Quad): Homography {
  // 8 unknowns: [a b c d e f g h], x = (a u + b v + c) / (g u + h v + 1)
  const A: number[][] = [];
  const B: number[] = [];
  for (let i = 0; i < 4; i++) {
    const { x: u, y: v } = from[i];
    const { x, y } = to[i];
    A.push([u, v, 1, 0, 0, 0, -u * x, -v * x]);
    B.push(x);
    A.push([0, 0, 0, u, v, 1, -u * y, -v * y]);
    B.push(y);
  }
  const h = solveLinear(A, B);
  return [...h, 1];
}

export function applyHomography(h: Homography, p: Point): Point {
  const w = h[6] * p.x + h[7] * p.y + h[8];
  return { x: (h[0] * p.x + h[1] * p.y + h[2]) / w, y: (h[3] * p.x + h[4] * p.y + h[5]) / w };
}

/** Gaussian elimination with partial pivoting. */
function solveLinear(A: number[][], B: number[]): number[] {
  const n = B.length;
  const M = A.map((row, i) => [...row, B[i]]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[pivot][col])) pivot = r;
    [M[col], M[pivot]] = [M[pivot], M[col]];
    const pv = M[col][col];
    if (Math.abs(pv) < 1e-12) throw new Error('Degenerate quad');
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = M[r][col] / pv;
      if (f === 0) continue;
      for (let c = col; c <= n; c++) M[r][c] -= f * M[col][c];
    }
  }
  return M.map((row, i) => row[n] / row[i]);
}

/**
 * Warps the quad in `src` to an upright `width` x `height` image
 * (bilinear sampling).
 */
export function warpQuad(src: RGBAImage, quad: Quad, width = CANON_WIDTH, height = CANON_HEIGHT): RGBAImage {
  const dstQuad: Quad = [
    { x: 0, y: 0 },
    { x: width, y: 0 },
    { x: width, y: height },
    { x: 0, y: height },
  ];
  // Map destination pixels back to source.
  const h = solveHomography(dstQuad, quad);
  // Supersample when shrinking a lot, to avoid aliasing on fine text.
  const quadW = Math.hypot(quad[1].x - quad[0].x, quad[1].y - quad[0].y);
  const ss = quadW > width * 1.6 ? 2 : 1;
  const out = createRGBA(width, height);
  const d = src.data;
  const sw = src.width;
  const sh = src.height;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const p = applyHomography(h, { x: x + (sx + 0.5) / ss, y: y + (sy + 0.5) / ss });
          const fx = clamp(p.x - 0.5, 0, sw - 1);
          const fy = clamp(p.y - 0.5, 0, sh - 1);
          const x0 = Math.floor(fx);
          const y0 = Math.floor(fy);
          const x1 = Math.min(sw - 1, x0 + 1);
          const y1 = Math.min(sh - 1, y0 + 1);
          const wx = fx - x0;
          const wy = fy - y0;
          const i00 = (y0 * sw + x0) * 4;
          const i10 = (y0 * sw + x1) * 4;
          const i01 = (y1 * sw + x0) * 4;
          const i11 = (y1 * sw + x1) * 4;
          const w00 = (1 - wx) * (1 - wy);
          const w10 = wx * (1 - wy);
          const w01 = (1 - wx) * wy;
          const w11 = wx * wy;
          r += d[i00] * w00 + d[i10] * w10 + d[i01] * w01 + d[i11] * w11;
          g += d[i00 + 1] * w00 + d[i10 + 1] * w10 + d[i01 + 1] * w01 + d[i11 + 1] * w11;
          b += d[i00 + 2] * w00 + d[i10 + 2] * w10 + d[i01 + 2] * w01 + d[i11 + 2] * w11;
        }
      }
      const n = ss * ss;
      const o = (y * width + x) * 4;
      out.data[o] = r / n;
      out.data[o + 1] = g / n;
      out.data[o + 2] = b / n;
      out.data[o + 3] = 255;
    }
  }
  return out;
}

export function rectToQuad(r: Rect): Quad {
  return [
    { x: r.x, y: r.y },
    { x: r.x + r.width, y: r.y },
    { x: r.x + r.width, y: r.y + r.height },
    { x: r.x, y: r.y + r.height },
  ];
}

/**
 * The on-screen guide: a card-shaped box centred in the frame, taking up
 * `fill` of the limiting dimension. The camera UI draws the same box.
 */
export function guideRect(frameWidth: number, frameHeight: number, fill = 0.8): Rect {
  let h = frameHeight * fill;
  let w = h * CARD_ASPECT;
  if (w > frameWidth * fill) {
    w = frameWidth * fill;
    h = w / CARD_ASPECT;
  }
  return { x: (frameWidth - w) / 2, y: (frameHeight - h) / 2, width: w, height: h };
}

// ---------------------------------------------------------------------------
// Card edge detection
// ---------------------------------------------------------------------------

interface Line {
  /** For near-vertical lines: x = a*y + b. For near-horizontal: y = a*x + b. */
  a: number;
  b: number;
  vertical: boolean;
  /** Fraction of scanlines whose strongest edge agreed with the fitted line. */
  support: number;
}

export interface CardDetection {
  quad: Quad;
  /** 0..1, how well the four edges were found. Below ~0.5 the guide box was used. */
  confidence: number;
  usedGuide: boolean;
}

const WORK_HEIGHT = 480;

/**
 * Finds the card's four edges near the guide box and returns its corners in
 * frame coordinates. The user lines the card up with the guide, so we only
 * search a band around each guide edge, which keeps this cheap and robust.
 * Falls back to the guide box itself when the edges are unclear (e.g. a
 * black-bordered card on a black table).
 */
export function detectCard(frame: RGBAImage, guide: Rect = guideRect(frame.width, frame.height)): CardDetection {
  const scale = Math.min(1, WORK_HEIGHT / frame.height);
  const gray = resizeGray(toGray(frame), Math.max(1, Math.round(frame.width * scale)), Math.max(1, Math.round(frame.height * scale)));
  const g = { x: guide.x * scale, y: guide.y * scale, width: guide.width * scale, height: guide.height * scale };
  const smooth = boxBlur3(gray);

  const bandX = g.width * 0.15;
  const bandY = g.height * 0.11;
  const left = fitEdge(smooth, 'left', g, bandX);
  const right = fitEdge(smooth, 'right', g, bandX);
  const top = fitEdge(smooth, 'top', g, bandY);
  const bottom = fitEdge(smooth, 'bottom', g, bandY);

  const guideQuad = rectToQuad(guide);
  const lines = [left, right, top, bottom];
  if (lines.some((l) => !l)) return { quad: guideQuad, confidence: 0, usedGuide: true };
  const [L, R, T, B] = lines as Line[];
  const confidence = Math.min(L.support, R.support, T.support, B.support);
  const corners = [intersect(L, T), intersect(R, T), intersect(R, B), intersect(L, B)].map((p) =>
    p ? { x: p.x / scale, y: p.y / scale } : null,
  );
  if (corners.some((p) => !p)) return { quad: guideQuad, confidence: 0, usedGuide: true };
  const quad = corners as Quad;
  if (confidence < 0.45 || !plausibleCard(quad, guide)) return { quad: guideQuad, confidence, usedGuide: true };
  return { quad, confidence, usedGuide: false };
}

function plausibleCard(q: Quad, guide: Rect): boolean {
  const w = (dist(q[0], q[1]) + dist(q[3], q[2])) / 2;
  const h = (dist(q[0], q[3]) + dist(q[1], q[2])) / 2;
  const aspect = w / h;
  if (aspect < CARD_ASPECT * 0.85 || aspect > CARD_ASPECT * 1.15) return false;
  if (h < guide.height * 0.6 || h > guide.height * 1.35) return false;
  return true;
}

function dist(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function boxBlur3(img: GrayImage): GrayImage {
  const out = createGray(img.width, img.height);
  const { width: w, height: h, data } = img;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0;
      let n = 0;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= h) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= w) continue;
          s += data[yy * w + xx];
          n++;
        }
      }
      out.data[y * w + x] = s / n;
    }
  }
  return out;
}

type Side = 'left' | 'right' | 'top' | 'bottom';

/**
 * Finds one side of the card near the guide edge.
 *
 * For each scanline across that side (skipping the rounded corners) we keep
 * every local peak in brightness change, then vote for straight lines through
 * them (a small Hough transform). Inside the card there are other long,
 * straight edges (black border to coloured frame, frame to art box), and on a
 * dark table the true outer edge can be weaker than those. So among the
 * well-supported lines we take the outermost one.
 */
function fitEdge(img: GrayImage, side: Side, g: Rect, band: number): Line | null {
  const vertical = side === 'left' || side === 'right';
  const { width: w, height: h, data } = img;
  const along0 = vertical ? g.y + g.height * 0.15 : g.x + g.width * 0.15;
  const along1 = vertical ? g.y + g.height * 0.85 : g.x + g.width * 0.85;
  const expected = side === 'left' ? g.x : side === 'right' ? g.x + g.width : side === 'top' ? g.y : g.y + g.height;
  const limit = vertical ? w : h;
  const c0 = Math.max(1, Math.floor(expected - band));
  const c1 = Math.min(limit - 2, Math.ceil(expected + band));
  if (c1 - c0 < 4) return null;
  const outward = side === 'left' || side === 'top' ? -1 : 1;

  const step = Math.max(1, Math.floor((along1 - along0) / 60));
  const peaks: { t: number; c: number }[] = [];
  let scanlines = 0;
  const grads = new Float64Array(c1 - c0 + 1);
  for (let t = Math.ceil(along0); t <= along1; t += step) {
    scanlines++;
    let max = 0;
    for (let c = c0; c <= c1; c++) {
      // central difference across the edge, summed over 3 scanlines
      let grad = 0;
      for (let k = -1; k <= 1; k++) {
        const tt = clamp(t + k, 0, (vertical ? h : w) - 1);
        const a = vertical ? data[tt * w + (c - 1)] : data[(c - 1) * w + tt];
        const b = vertical ? data[tt * w + (c + 1)] : data[(c + 1) * w + tt];
        grad += b - a;
      }
      grads[c - c0] = Math.abs(grad);
      if (grads[c - c0] > max) max = grads[c - c0];
    }
    const thresh = Math.max(MIN_EDGE, max * 0.12);
    for (let c = c0; c <= c1; c++) {
      const v = grads[c - c0];
      if (v < thresh) continue;
      const prev = c > c0 ? grads[c - 1 - c0] : 0;
      const next = c < c1 ? grads[c + 1 - c0] : 0;
      if (v >= prev && v > next) peaks.push({ t, c });
    }
  }
  if (!scanlines || peaks.length < 4) return null;

  // Hough vote over slope a (|a| <= 0.2) and offset at the middle of the side.
  const tMid = (along0 + along1) / 2;
  const slopes = 41;
  const span = c1 - c0 + 1;
  const votes = new Map<number, Set<number>>();
  for (const p of peaks) {
    for (let si = 0; si < slopes; si++) {
      const a = -0.2 + (0.4 * si) / (slopes - 1);
      const off = Math.round(p.c - a * (p.t - tMid)) - c0;
      if (off < -2 || off > span + 2) continue;
      for (let d = -1; d <= 1; d++) {
        const key = si * (span + 8) + (off + d + 4);
        let set = votes.get(key);
        if (!set) votes.set(key, (set = new Set()));
        set.add(p.t);
      }
    }
  }
  let best = 0;
  for (const s of votes.values()) best = Math.max(best, s.size);
  if (best < Math.max(5, scanlines * 0.3)) return null;
  // Outermost line with at least 60% of the best support.
  let pickKey = -1;
  let pickPos = outward < 0 ? Infinity : -Infinity;
  let pickSupport = 0;
  for (const [key, s] of votes) {
    if (s.size < best * 0.6) continue;
    const off = (key % (span + 8)) - 4 + c0;
    const better = outward < 0 ? off < pickPos : off > pickPos;
    if (better || (off === pickPos && s.size > pickSupport)) {
      pickKey = key;
      pickPos = off;
      pickSupport = s.size;
    }
  }
  if (pickKey < 0) return null;
  const si = Math.floor(pickKey / (span + 8));
  const a0 = -0.2 + (0.4 * si) / (slopes - 1);
  const b0 = pickPos - a0 * tMid;

  // Refine with least squares on the peaks near that line (one per scanline).
  const tol = 2.5;
  const byT = new Map<number, { t: number; c: number }>();
  for (const p of peaks) {
    const r = Math.abs(p.c - (a0 * p.t + b0));
    if (r > tol) continue;
    const cur = byT.get(p.t);
    if (!cur || r < Math.abs(cur.c - (a0 * cur.t + b0))) byT.set(p.t, p);
  }
  const inliers = [...byT.values()];
  if (inliers.length < 4) return null;
  const [a, b] = leastSquares(inliers);
  if (Math.abs(a) > 0.22) return null;
  return { a, b, vertical, support: inliers.length / scanlines };
}

const MIN_EDGE = 24;

function leastSquares(pts: { t: number; c: number }[]): [number, number] {
  const n = pts.length;
  let st = 0;
  let sc = 0;
  let stt = 0;
  let stc = 0;
  for (const p of pts) {
    st += p.t;
    sc += p.c;
    stt += p.t * p.t;
    stc += p.t * p.c;
  }
  const den = n * stt - st * st;
  if (Math.abs(den) < 1e-9) return [0, sc / n];
  const a = (n * stc - st * sc) / den;
  return [a, (sc - a * st) / n];
}

/** Intersection of a near-vertical line (x = a y + b) and a near-horizontal one (y = c x + d). */
function intersect(v: Line, hz: Line): Point | null {
  const den = 1 - v.a * hz.a;
  if (Math.abs(den) < 1e-9) return null;
  const x = (v.a * hz.b + v.b) / den;
  return { x, y: hz.a * x + hz.b };
}
