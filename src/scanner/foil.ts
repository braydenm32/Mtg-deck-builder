/**
 * Telling foil from non-foil by watching the card move.
 *
 * A single photo can't say much: foil looks like ordinary ink until light
 * catches it. What gives foil away is that, as the card tilts (in the hand, or
 * sliding and dropping through a scanning tower), a rainbow sheen sweeps across
 * it and the COLOUR of each spot changes. On a non-foil card the only thing
 * that moves is glare, and glare adds white light: a spot gets brighter and
 * paler, but keeps its hue.
 *
 * So for a run of flattened, aligned views of one card (see captureFoilFrame in
 * the client), this:
 *
 *   1. Averages each view into a grid of cells (ignoring the outer border,
 *      where a slightly-off edge fit would leak in the table).
 *   2. Evens out each view's overall brightness and white balance (the phone
 *      keeps adjusting both), using the median cell as the anchor.
 *   3. Takes each cell's chromaticity (its colour with brightness divided out)
 *      and compares it with that cell's median over all views. A change that is
 *      just "the same colour, paler" is explained as glare and not counted.
 *      Neighbouring cells are tried too, so a one-cell wobble in the edge fit
 *      at a colour border isn't mistaken for a colour change.
 *   4. Scores each view by the share of cells whose colour changed in a way
 *      glare can't explain, and the run by its best views.
 *
 * It answers "unsure" when there is too little to go on: too few views, or the
 * light on the card never changed (a foil card held perfectly still under flat
 * light shows no sheen, so its stillness proves nothing).
 *
 * The thresholds are set on simulated frames (tests/scanner-foil.test.ts) and
 * still need tuning on real phone footage; until then the scanner's finish
 * setting stays the default and "Auto" is opt-in.
 */
import type { FoilVerdict } from './finish';
import type { RGBAImage } from './image';

/** Size the client flattens each view to for this check: small, so it can run every frame. */
export const FOIL_FRAME_WIDTH = 60;
export const FOIL_FRAME_HEIGHT = 84;

const CELL = 4;
/** Cells skipped at each edge of the card. */
const BORDER_CELLS = 1;
/** Cells darker than this (linear light, 0..1) have noisy colour and are skipped (about 28/255 on screen). */
const MIN_LUMA = 0.03;
/** Pixels this bright (0..255 as captured) in any channel may be clipped, which shifts hue falsely. */
const MAX_CHANNEL = 245;
/** Chromaticity change (linear light, 0..~0.7 scale) that counts as "this spot changed colour". */
const HUE_CHANGE = 0.02;
/** A view must still look like the same card (brightness pattern correlation) to be used. */
const MIN_SAME_CARD = 0.7;
/** Share of a view's cells whose brightness changed noticeably, to count as "the light moved". */
const LIGHT_CHANGE = 0.08;
/** Brightness change (log ratio, linear light) that counts as noticeable for LIGHT_CHANGE. */
const LIGHT_STEP = 0.25;

/** Share of cells with unexplained colour change, in the best views, to call it foil. */
export const FOIL_SCORE = 0.06;
/** At or below this (and with the light having moved), call it non-foil. */
export const NONFOIL_SCORE = 0.005;

/** Largest edge-fit wobble lined up before comparing views: shift (pixels at FOIL_FRAME size) and scale. */
const SHIFT = 3;
const SCALE = 0.06;
/** A cell's fine detail (relative to its brightness) above which it counts as textured, for sameDetail. */
const DETAIL = 0.04;
/** A cell this many times brighter than usual is under glare and isn't judged. */
const GLARE_RATIO = 3;
/** Cells around each cell (each way) whose shared colour shift is taken off before judging it. */
const TINT_RADIUS = 3;
/** Share of a cell's own colour spread that a sub-pixel wobble can fake (see cellSpread). */
const EDGE_SLACK = 0.3;
/** Views need at least this many judgeable cells to count. */
const MIN_VALID_CELLS = 20;

const MIN_VIEWS = 4;
/** Calling a card non-foil needs more looks than calling it foil: no sheen in a few views proves little. */
const MIN_VIEWS_NONFOIL = 6;
const MAX_VIEWS = 16;

export interface FoilEvidence {
  verdict: FoilVerdict;
  /** 0..1, share of the card that changed colour in a way glare can't explain (best views). */
  sheen: number;
  /** 0..1, like sheen but counting every colour change (also the phone's own colour shifts). */
  anyChange: number;
  /** 0..1, how much the light on the card moved across the views. */
  lightMoved: number;
  /** Views given, and views that looked enough like the same card to use. */
  views: number;
  used: number;
}

/**
 * One view: linear-light R, G, B planes (0..1; light adds up linearly, so glare
 * is a plain "plus white" there), the brightest captured channel per pixel (to
 * spot clipping), and a coarse signature for pruning repeats.
 */
interface View {
  w: number;
  h: number;
  rgb: [Float32Array, Float32Array, Float32Array];
  hi: Float32Array;
  sig: Float32Array;
}

/** sRGB-ish camera values to linear light. */
const LINEAR = Float32Array.from({ length: 256 }, (_, v) => (v / 255) ** 2.2);

function toView(img: RGBAImage): View {
  const n = img.width * img.height;
  const rgb: View['rgb'] = [new Float32Array(n), new Float32Array(n), new Float32Array(n)];
  const hi = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const r = img.data[i * 4];
    const g = img.data[i * 4 + 1];
    const b = img.data[i * 4 + 2];
    rgb[0][i] = LINEAR[r];
    rgb[1][i] = LINEAR[g];
    rgb[2][i] = LINEAR[b];
    hi[i] = Math.max(r, g, b);
  }
  // 6x7 block means of each channel: enough to tell "nothing changed" from "something did".
  const sig = new Float32Array(6 * 7 * 3);
  for (let y = 0; y < img.height; y++) {
    const by = Math.min(6, Math.floor((y / img.height) * 7));
    for (let x = 0; x < img.width; x++) {
      const bx = Math.min(5, Math.floor((x / img.width) * 6));
      const k = (by * 6 + bx) * 3;
      const i = y * img.width + x;
      sig[k] += rgb[0][i];
      sig[k + 1] += rgb[1][i];
      sig[k + 2] += rgb[2][i];
    }
  }
  return { w: img.width, h: img.height, rgb, hi, sig };
}

function median(values: ArrayLike<number>): number {
  // A typed array sorts numerically, and much faster than a plain array with a comparator.
  const a = Float64Array.from(values).sort();
  if (!a.length) return 0;
  const m = a.length >> 1;
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

function correlation(a: Float32Array, b: Float32Array): number {
  const n = a.length;
  let ma = 0;
  let mb = 0;
  for (let i = 0; i < n; i++) {
    ma += a[i];
    mb += b[i];
  }
  ma /= n;
  mb /= n;
  let sab = 0;
  let saa = 0;
  let sbb = 0;
  for (let i = 0; i < n; i++) {
    const da = a[i] - ma;
    const db = b[i] - mb;
    sab += da * db;
    saa += da * da;
    sbb += db * db;
  }
  return saa && sbb ? sab / Math.sqrt(saa * sbb) : 0;
}

/** Per-pixel median over views of one plane. */
function medianPlane(planes: Float32Array[]): Float32Array {
  const n = planes[0].length;
  const out = new Float32Array(n);
  const tmp = new Float32Array(planes.length);
  for (let i = 0; i < n; i++) {
    for (let v = 0; v < planes.length; v++) tmp[v] = planes[v][i];
    tmp.sort();
    const m = tmp.length >> 1;
    out[i] = tmp.length % 2 ? tmp[m] : (tmp[m - 1] + tmp[m]) / 2;
  }
  return out;
}

/** How a view maps onto the reference: scale about the middle (x and y separately), then shift, in pixels. */
interface Fit {
  sx: number;
  sy: number;
  dx: number;
  dy: number;
}

/** Samples plane `p` through `fit` (bilinear; edges repeat), so it lines up with the reference. */
function warpPlane(p: Float32Array, w: number, h: number, f: Fit): Float32Array {
  if (f.sx === 1 && f.sy === 1 && !f.dx && !f.dy) return p;
  const out = new Float32Array(p.length);
  const cx = (w - 1) / 2;
  const cy = (h - 1) / 2;
  for (let y = 0; y < h; y++) {
    const fy = Math.min(h - 1, Math.max(0, cy + (y - cy) * f.sy + f.dy));
    const y0 = Math.floor(fy);
    const y1 = Math.min(h - 1, y0 + 1);
    const wy = fy - y0;
    for (let x = 0; x < w; x++) {
      const fx = Math.min(w - 1, Math.max(0, cx + (x - cx) * f.sx + f.dx));
      const x0 = Math.floor(fx);
      const x1 = Math.min(w - 1, x0 + 1);
      const wx = fx - x0;
      out[y * w + x] =
        (p[y0 * w + x0] * (1 - wx) + p[y0 * w + x1] * wx) * (1 - wy) + (p[y1 * w + x0] * (1 - wx) + p[y1 * w + x1] * wx) * wy;
    }
  }
  return out;
}

/** Mean absolute difference between `luma` seen through `f` and `ref`, over the middle of the card (every `step`th pixel). */
function fitError(luma: Float32Array, ref: Float32Array, w: number, h: number, f: Fit, step: number): number {
  const cx = (w - 1) / 2;
  const cy = (h - 1) / 2;
  const m = 4;
  let err = 0;
  let n = 0;
  for (let y = m; y < h - m; y += step) {
    const sy = Math.round(cy + (y - cy) * f.sy + f.dy);
    if (sy < 0 || sy >= h) continue;
    for (let x = m; x < w - m; x += step) {
      const sx = Math.round(cx + (x - cx) * f.sx + f.dx);
      if (sx < 0 || sx >= w) continue;
      err += Math.abs(luma[sy * w + sx] - ref[y * w + x]);
      n++;
    }
  }
  return n ? err / n : Infinity;
}

/**
 * Lines a view up with the reference. A hand-held card is found a little
 * differently in every frame (an edge fit on the inner frame line instead of
 * the border, a tilt), so allow a few percent of scale as well as a shift:
 * a coarse search, then a fine one around the best.
 */
function bestFit(luma: Float32Array, ref: Float32Array, w: number, h: number): Fit {
  let best: Fit = { sx: 1, sy: 1, dx: 0, dy: 0 };
  let bestErr = fitError(luma, ref, w, h, best, 2) * 0.99; // a slight preference for leaving it be
  for (let sx = 1 - SCALE; sx <= 1 + SCALE + 1e-9; sx += SCALE / 3) {
    for (let sy = 1 - SCALE; sy <= 1 + SCALE + 1e-9; sy += SCALE / 3) {
      for (let dy = -SHIFT; dy <= SHIFT; dy += SHIFT) {
        for (let dx = -SHIFT; dx <= SHIFT; dx += SHIFT) {
          const f = { sx, sy, dx, dy };
          const e = fitError(luma, ref, w, h, f, 2);
          if (e < bestErr) {
            bestErr = e;
            best = f;
          }
        }
      }
    }
  }
  const coarse = best;
  bestErr = fitError(luma, ref, w, h, coarse, 1);
  const ds = SCALE / 6;
  for (const sx of [coarse.sx - ds, coarse.sx, coarse.sx + ds]) {
    for (const sy of [coarse.sy - ds, coarse.sy, coarse.sy + ds]) {
      for (let dy = coarse.dy - 1; dy <= coarse.dy + 1; dy++) {
        for (let dx = coarse.dx - 1; dx <= coarse.dx + 1; dx++) {
          const f = { sx, sy, dx, dy };
          const e = fitError(luma, ref, w, h, f, 1);
          if (e < bestErr) {
            bestErr = e;
            best = f;
          }
        }
      }
    }
  }
  return best;
}

/** Each pixel minus the mean of its 3x3 neighbourhood: the fine detail (print, text, edges). */
function detail(luma: Float32Array, w: number, h: number): Float32Array {
  const out = new Float32Array(luma.length);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      let s = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) s += luma[(y + dy) * w + x + dx];
      out[y * w + x] = luma[y * w + x] - s / 9;
    }
  }
  return out;
}

/**
 * Whether each cell of a view still shows the same thing as the reference
 * (same fine detail, not much darker). A thumb over the card, or a part the
 * edge fit got wrong, changes colour too, but it isn't foil.
 */
function sameDetail(view: Float32Array, viewLuma: Float32Array, ref: Float32Array, refLuma: Float32Array, w: number, cols: number, rows: number): Uint8Array {
  const ok = new Uint8Array(cols * rows);
  for (let cy = 0; cy < rows; cy++) {
    for (let cx = 0; cx < cols; cx++) {
      const x0 = (cx + BORDER_CELLS) * CELL - 1;
      const y0 = (cy + BORDER_CELLS) * CELL - 1;
      let rr = 0;
      let vv = 0;
      let rv = 0;
      let lr = 0;
      let lv = 0;
      for (let y = y0; y < y0 + CELL + 2; y++) {
        for (let x = x0; x < x0 + CELL + 2; x++) {
          const i = y * w + x;
          rr += ref[i] * ref[i];
          vv += view[i] * view[i];
          rv += ref[i] * view[i];
          lr += refLuma[i];
          lv += viewLuma[i];
        }
      }
      const n = (CELL + 2) * (CELL + 2);
      const mean = lr / n;
      // Much darker than usual: a shadow or a finger. Much brighter: glare, where the camera's
      // highlight handling (not just the light) shifts colours, so it says little either way.
      if (lv < lr * 0.5 || lv > lr * GLARE_RATIO) continue;
      const textured = Math.sqrt(rr / n) > DETAIL * mean;
      // Detail that no longer matches: something else is in front, or this part is misplaced.
      // (Detail appearing on a plain patch is allowed: foil's rainbow can be stripy.)
      if (textured && rv / Math.sqrt(rr * vv || 1) < 0.5) continue;
      ok[cy * cols + cx] = 1;
    }
  }
  return ok;
}

/** Each cell's colour: luma, chromaticity relative to grey (cr, cg), and whether it can be trusted. */
interface Cells {
  luma: Float32Array;
  cr: Float32Array;
  cg: Float32Array;
  ok: Uint8Array;
}

function cellsOf(rgb: Float32Array[], hiPlane: Float32Array, w: number, cols: number, rows: number): Cells {
  const n = cols * rows;
  const c: Cells = { luma: new Float32Array(n), cr: new Float32Array(n), cg: new Float32Array(n), ok: new Uint8Array(n) };
  for (let cy = 0; cy < rows; cy++) {
    for (let cx = 0; cx < cols; cx++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let hi = 0;
      const x0 = (cx + BORDER_CELLS) * CELL;
      const y0 = (cy + BORDER_CELLS) * CELL;
      for (let y = y0; y < y0 + CELL; y++) {
        for (let x = x0; x < x0 + CELL; x++) {
          const i = y * w + x;
          r += rgb[0][i];
          g += rgb[1][i];
          b += rgb[2][i];
          hi = Math.max(hi, hiPlane[i]);
        }
      }
      const k = cy * cols + cx;
      const s = r + g + b;
      c.luma[k] = s / (3 * CELL * CELL);
      c.ok[k] = c.luma[k] >= MIN_LUMA && hi < MAX_CHANNEL ? 1 : 0;
      c.cr[k] = s ? r / s - 1 / 3 : 0;
      c.cg[k] = s ? g / s - 1 / 3 : 0;
    }
  }
  return c;
}

/**
 * How much each reference cell's colour varies inside it (plus a 1-pixel
 * ring, which is what a 1-pixel wobble brings in). A cell across a colour
 * border changes colour a little whenever the edge fit shifts, so such cells
 * need a bigger change to count; flat cells count at HUE_CHANGE.
 */
function cellSpread(rgb: Float32Array[], w: number, cols: number, rows: number): Float32Array {
  const spread = new Float32Array(cols * rows);
  for (let cy = 0; cy < rows; cy++) {
    for (let cx = 0; cx < cols; cx++) {
      let loR = Infinity;
      let hiR = -Infinity;
      let loG = Infinity;
      let hiG = -Infinity;
      const x0 = (cx + BORDER_CELLS) * CELL - 1;
      const y0 = (cy + BORDER_CELLS) * CELL - 1;
      for (let y = y0; y < y0 + CELL + 2; y++) {
        for (let x = x0; x < x0 + CELL + 2; x++) {
          const i = y * w + x;
          const sum = rgb[0][i] + rgb[1][i] + rgb[2][i];
          if (sum < 3 * MIN_LUMA) continue;
          const r = rgb[0][i] / sum;
          const g = rgb[1][i] / sum;
          loR = Math.min(loR, r);
          hiR = Math.max(hiR, r);
          loG = Math.min(loG, g);
          hiG = Math.max(hiG, g);
        }
      }
      spread[cy * cols + cx] = loR === Infinity ? 1 : Math.hypot(hiR - loR, hiG - loG);
    }
  }
  return spread;
}

/**
 * How far a cell's colour moved from the reference in a way glare can't
 * explain: glare scales the chromaticity towards grey (factor 0..~1), so only
 * what's left after the best such scaling counts.
 */
function unexplained(cr: number, cg: number, rr: number, rg: number): [number, number] {
  const ref2 = rr * rr + rg * rg;
  let alpha = 0;
  if (ref2 > 1e-6) alpha = Math.min(1.15, Math.max(0, (cr * rr + cg * rg) / ref2));
  return [cr - alpha * rr, cg - alpha * rg];
}

/** Judges a run of flattened views of one card (all the same size, see FOIL_FRAME_*). */
export function foilEvidence(frames: RGBAImage[]): FoilEvidence {
  if (!frames.length) return unsure(0);
  const { width, height } = frames[0];
  const views = frames.filter((f) => f.width === width && f.height === height).map(toView);
  return judge(views, frames.length);
}

function lumaOf(rgb: Float32Array[]): Float32Array {
  const out = new Float32Array(rgb[0].length);
  for (let i = 0; i < out.length; i++) out[i] = (rgb[0][i] + rgb[1][i] + rgb[2][i]) / 3;
  return out;
}

/** Every `step`-th value (a quicker sample for a median). */
function every(p: Float32Array, step: number): Float32Array {
  const out = new Float32Array(Math.ceil(p.length / step));
  for (let i = 0, j = 0; i < p.length; i += step, j++) out[j] = p[i];
  return out;
}

function scaled(p: Float32Array, k: number): Float32Array {
  const out = new Float32Array(p.length);
  for (let i = 0; i < p.length; i++) out[i] = p[i] * k;
  return out;
}

/** Per-channel gains that bring view `a` to the reference, from the dimmer half of its usable pixels. */
function channelGains(a: { rgb: Float32Array[]; hi: Float32Array }, ref: Float32Array[], refLuma: Float32Array): number[] {
  const luma = lumaOf(a.rgb);
  const idx: number[] = [];
  for (let i = 0; i < luma.length; i++) if (refLuma[i] >= MIN_LUMA && a.hi[i] < MAX_CHANNEL && luma[i] > 0) idx.push(i);
  if (idx.length < 50) return [1, 1, 1];
  const ratios = new Float64Array(idx.length);
  for (let j = 0; j < idx.length; j++) ratios[j] = luma[idx[j]] / refLuma[idx[j]];
  const mid = median(ratios);
  return [0, 1, 2].map((c) => {
    const r: number[] = [];
    for (let j = 0; j < idx.length; j++) {
      const i = idx[j];
      if (ratios[j] <= mid && a.rgb[c][i] > 0) r.push(ref[c][i] / a.rgb[c][i]);
    }
    return median(r) || 1;
  });
}

const unsure = (views: number, used = 0): FoilEvidence => ({ verdict: 'unsure', sheen: 0, anyChange: 0, lightMoved: 0, views, used });

function judge(views: View[], given: number): FoilEvidence {
  if (views.length < MIN_VIEWS) return unsure(given);
  const { w, h } = views[0];
  const cols = Math.floor(w / CELL) - 2 * BORDER_CELLS;
  const rows = Math.floor(h / CELL) - 2 * BORDER_CELLS;
  const n = cols * rows;

  // Line every view up with the others (the edge fit wobbles by a pixel or two),
  // comparing brightness patterns with each view's overall level divided out.
  const levelled = views.map((v) => {
    const l = lumaOf(v.rgb);
    const m = median(every(l, 3)) || 1;
    for (let i = 0; i < l.length; i++) l[i] /= m;
    return l;
  });
  const refShape = medianPlane(levelled);
  const aligned = views.map((v, i) => {
    const f = bestFit(levelled[i], refShape, w, h);
    return { rgb: v.rgb.map((p) => warpPlane(p, w, h, f)), hi: warpPlane(v.hi, w, h, f) };
  });

  // 2. Even out exposure and white balance. Each channel of each view gets the
  // gain that best matches the all-views median, judged on the dimmer half of
  // its pixels (glare only ever brightens, so those are the ones it missed).
  const rough = [0, 1, 2].map((c) => medianPlane(aligned.map((a) => a.rgb[c])));
  const roughLuma = lumaOf(rough);
  const norm = aligned.map((a) => {
    const gains = channelGains(a, rough, roughLuma);
    return { rgb: a.rgb.map((p, c) => scaled(p, gains[c])), hi: a.hi };
  });
  const refRgb = [0, 1, 2].map((c) => medianPlane(norm.map((a) => a.rgb[c])));
  const spread = cellSpread(refRgb, w, cols, rows);
  const cells = norm.map((a) => cellsOf(a.rgb, a.hi, w, cols, rows));
  const refLumaPlane = lumaOf(refRgb);
  const refDetail = detail(refLumaPlane, w, h);
  const same = norm.map((a) => {
    const l = lumaOf(a.rgb);
    return sameDetail(detail(l, w, h), l, refDetail, refLumaPlane, w, cols, rows);
  });

  // Reference: each cell's median over all views.
  const ref: Cells = { luma: new Float32Array(n), cr: new Float32Array(n), cg: new Float32Array(n), ok: new Uint8Array(n) };
  for (let k = 0; k < n; k++) {
    ref.luma[k] = median(cells.map((c) => c.luma[k]));
    ref.cr[k] = median(cells.map((c) => c.cr[k]));
    ref.cg[k] = median(cells.map((c) => c.cg[k]));
    ref.ok[k] = cells.filter((c) => c.ok[k]).length * 2 >= cells.length ? 1 : 0;
  }

  // A view that doesn't look like the same card (a half-visible card mid-fall,
  // a wrong edge fit) would show "colour change" everywhere: leave it out.
  const usedIdx = cells.map((c, i) => (correlation(c.luma, ref.luma) >= MIN_SAME_CARD ? i : -1)).filter((i) => i >= 0);
  const used = usedIdx.map((i) => cells[i]);
  if (used.length < MIN_VIEWS) return unsure(given, used.length);

  const sheens: number[] = [];
  /** The same, without taking off shared colour shifts: to call a card non-foil, even these must be quiet. */
  const raws: number[] = [];
  const lights: number[] = [];
  for (const i of usedIdx) {
    const c = cells[i];
    let valid = 0;
    let changed = 0;
    let changedRaw = 0;
    let lit = 0;
    // 3. Each cell's unexplained colour change, against this cell or a neighbour (whichever explains it best).
    const vr = new Float32Array(n);
    const vg = new Float32Array(n);
    const judged = new Uint8Array(n);
    for (let cy = 0; cy < rows; cy++) {
      for (let cx = 0; cx < cols; cx++) {
        const k = cy * cols + cx;
        if (!c.ok[k] || !ref.ok[k] || !same[i][k]) continue;
        let best = Infinity;
        for (let dy = -1; dy <= 1; dy++) {
          const y = cy + dy;
          if (y < 0 || y >= rows) continue;
          for (let dx = -1; dx <= 1; dx++) {
            const x = cx + dx;
            if (x < 0 || x >= cols) continue;
            const j = y * cols + x;
            if (!ref.ok[j]) continue;
            const [ur, ug] = unexplained(c.cr[k], c.cg[k], ref.cr[j], ref.cg[j]);
            const m = Math.hypot(ur, ug);
            if (m < best) {
              best = m;
              vr[k] = ur;
              vg[k] = ug;
            }
          }
        }
        if (best === Infinity) continue;
        judged[k] = 1;
        valid++;
        if (Math.abs(Math.log(c.luma[k] / Math.max(MIN_LUMA, ref.luma[k]))) > LIGHT_STEP) lit++;
      }
    }
    // The phone's colour handling shifts whole regions a little (its tone curve isn't a plain gain):
    // take off the change shared by the surrounding cells. Foil's rainbow changes from spot to spot.
    for (let cy = 0; cy < rows; cy++) {
      for (let cx = 0; cx < cols; cx++) {
        const k = cy * cols + cx;
        if (!judged[k]) continue;
        const nr: number[] = [];
        const ng: number[] = [];
        for (let y = Math.max(0, cy - TINT_RADIUS); y <= Math.min(rows - 1, cy + TINT_RADIUS); y++) {
          for (let x = Math.max(0, cx - TINT_RADIUS); x <= Math.min(cols - 1, cx + TINT_RADIUS); x++) {
            const j = y * cols + x;
            if (judged[j]) {
              nr.push(vr[j]);
              ng.push(vg[j]);
            }
          }
        }
        const allowed = HUE_CHANGE + EDGE_SLACK * spread[k];
        if (Math.hypot(vr[k], vg[k]) > allowed) changedRaw++;
        const left = Math.hypot(vr[k] - median(nr), vg[k] - median(ng));
        if (left > allowed) changed++;
      }
    }
    if (valid < MIN_VALID_CELLS) continue;
    sheens.push(changed / valid);
    raws.push(changedRaw / valid);
    lights.push(lit / valid);
  }
  if (sheens.length < MIN_VIEWS) return unsure(given, used.length);

  // 4. The run's score: a view near the top quarter, never the single best
  // (one odd view isn't enough; a foil card shows its sheen in many).
  const rank = (xs: number[]) => [...xs].sort((a, b) => b - a)[Math.max(1, Math.floor(xs.length / 4))];
  const sheen = rank(sheens);
  const raw = rank(raws);
  const lightMoved = Math.max(...lights, sheen);
  let verdict: FoilVerdict = 'unsure';
  if (sheen >= FOIL_SCORE) verdict = 'foil';
  else if (raw <= NONFOIL_SCORE && lightMoved >= LIGHT_CHANGE && sheens.length >= MIN_VIEWS_NONFOIL) verdict = 'nonfoil';
  return { verdict, sheen, anyChange: raw, lightMoved, views: given, used: used.length };
}

/**
 * Collects views of the card in front of the camera, to judge whenever asked.
 * Keeps at most MAX_VIEWS, dropping the most repetitive ones (a card sitting
 * still adds nothing new) so the moments where it moved are kept.
 */
export class FoilWatcher {
  private views: View[] = [];
  private size = '';
  private given = 0;

  /** Views kept now (at most MAX_VIEWS). */
  get count(): number {
    return this.views.length;
  }

  /** Views ever added (keeps growing after the oldest repeats are dropped). */
  get added(): number {
    return this.given;
  }

  reset(): void {
    this.views = [];
    this.given = 0;
  }

  add(frame: RGBAImage): void {
    const size = `${frame.width}x${frame.height}`;
    if (size !== this.size) {
      this.size = size;
      this.reset();
    }
    this.given++;
    this.views.push(toView(frame));
    if (this.views.length > MAX_VIEWS) this.dropMostRepetitive();
  }

  evidence(): FoilEvidence {
    return judge(this.views, this.given);
  }

  private dropMostRepetitive(): void {
    // Never drop the first view (the card arriving) or the newest.
    let drop = 1;
    let least = Infinity;
    for (let i = 1; i < this.views.length - 1; i++) {
      const d = viewDistance(this.views[i], this.views[i - 1]);
      if (d < least) {
        least = d;
        drop = i;
      }
    }
    this.views.splice(drop, 1);
  }
}

function viewDistance(a: View, b: View): number {
  let s = 0;
  for (let k = 0; k < a.sig.length; k++) s += Math.abs(a.sig[k] - b.sig[k]);
  return s;
}
