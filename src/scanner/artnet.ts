/**
 * A small image network (MobileNetV3-Small, ImageNet weights) that turns a
 * card's artwork into a list of numbers, an "embedding". Two photos of the same
 * artwork give similar embeddings even with blur, glare, foil sheen or a
 * slightly crooked crop, which plain fingerprints (pHash) don't survive.
 *
 * Plain TypeScript with no dependencies, so the exact same code runs on the
 * phone (in a worker) and in Node (building the index, tests). It is about
 * 23 million multiply-adds per card at 160x128.
 *
 * Weights file (public/scan/art-net.bin, made by scripts/scanner/export-art-net.py):
 *   "MTGN", u32 header length, JSON header, padding to 2 bytes, float16 weights.
 * Batch norm is already folded into the convolutions.
 */

export interface ArtNetBlock {
  expand?: boolean;
  k: number;
  stride: number;
  exp: number;
  out: number;
  se?: boolean;
  act: "relu" | "hswish";
}

interface Header {
  arch: string;
  input: [number, number];
  scale: number;
  offset: number;
  blocks: ArtNetBlock[];
  tensors: { name: string; shape: number[]; offset: number }[];
}

/** An activation map: height x width x channels, channels last. */
interface Map3 {
  h: number;
  w: number;
  c: number;
  d: Float32Array;
}

function halfToFloat(h: number): number {
  const s = h & 0x8000 ? -1 : 1;
  const e = (h >> 10) & 0x1f;
  const f = h & 0x3ff;
  if (e === 0) return s * f * 2 ** -24;
  if (e === 31) return f ? NaN : s * Infinity;
  return s * (1 + f / 1024) * 2 ** (e - 15);
}

const HALF = (() => {
  const t = new Float32Array(65536);
  for (let i = 0; i < 65536; i++) t[i] = halfToFloat(i);
  return t;
})();

/** TF "same" padding: how many pixels to add before (the rest go after). */
function samePad(size: number, k: number, stride: number): { out: number; before: number } {
  const out = Math.ceil(size / stride);
  const total = Math.max((out - 1) * stride + k - size, 0);
  return { out, before: Math.floor(total / 2) };
}

function act(x: Map3, kind: "relu" | "hswish" | "none"): Map3 {
  const d = x.d;
  if (kind === "relu") for (let i = 0; i < d.length; i++) d[i] = d[i] > 0 ? d[i] : 0;
  else if (kind === "hswish")
    for (let i = 0; i < d.length; i++) {
      const v = d[i];
      d[i] = v <= -3 ? 0 : v >= 3 ? v : (v * (v + 3)) / 6;
    }
  return x;
}

/** 1x1 convolution: W is [cout][cin]. */
function pointwise(x: Map3, w: Float32Array, b: Float32Array): Map3 {
  const cin = x.c;
  const cout = b.length;
  const n = x.h * x.w;
  const out = new Float32Array(n * cout);
  const src = x.d;
  for (let p = 0; p < n; p++) {
    const si = p * cin;
    const oi = p * cout;
    for (let co = 0; co < cout; co++) {
      let s = b[co];
      let wi = co * cin;
      let ci = 0;
      for (; ci + 3 < cin; ci += 4, wi += 4) {
        s += src[si + ci] * w[wi] + src[si + ci + 1] * w[wi + 1] + src[si + ci + 2] * w[wi + 2] + src[si + ci + 3] * w[wi + 3];
      }
      for (; ci < cin; ci++, wi++) s += src[si + ci] * w[wi];
      out[oi + co] = s;
    }
  }
  return { h: x.h, w: x.w, c: cout, d: out };
}

/** Depthwise k x k convolution, "same" padding. W is [kh][kw][c]. */
function depthwise(x: Map3, w: Float32Array, b: Float32Array, k: number, stride: number): Map3 {
  const { h, w: wd, c } = x;
  const py = samePad(h, k, stride);
  const px = samePad(wd, k, stride);
  const oh = py.out;
  const ow = px.out;
  const out = new Float32Array(oh * ow * c);
  const src = x.d;
  for (let oy = 0; oy < oh; oy++) {
    for (let ox = 0; ox < ow; ox++) {
      const oi = (oy * ow + ox) * c;
      out.set(b, oi);
      for (let ky = 0; ky < k; ky++) {
        const iy = oy * stride + ky - py.before;
        if (iy < 0 || iy >= h) continue;
        for (let kx = 0; kx < k; kx++) {
          const ix = ox * stride + kx - px.before;
          if (ix < 0 || ix >= wd) continue;
          const si = (iy * wd + ix) * c;
          const wi = (ky * k + kx) * c;
          for (let ch = 0; ch < c; ch++) out[oi + ch] += src[si + ch] * w[wi + ch];
        }
      }
    }
  }
  return { h: oh, w: ow, c, d: out };
}

/** Full 3x3 (or k x k) convolution for the first layer. W is [cout][kh][kw][cin]. */
function convFull(x: Map3, w: Float32Array, b: Float32Array, k: number, stride: number): Map3 {
  const { h, w: wd, c: cin } = x;
  const cout = b.length;
  const py = samePad(h, k, stride);
  const px = samePad(wd, k, stride);
  const out = new Float32Array(py.out * px.out * cout);
  const src = x.d;
  for (let oy = 0; oy < py.out; oy++) {
    for (let ox = 0; ox < px.out; ox++) {
      const oi = (oy * px.out + ox) * cout;
      for (let co = 0; co < cout; co++) {
        let s = b[co];
        for (let ky = 0; ky < k; ky++) {
          const iy = oy * stride + ky - py.before;
          if (iy < 0 || iy >= h) continue;
          for (let kx = 0; kx < k; kx++) {
            const ix = ox * stride + kx - px.before;
            if (ix < 0 || ix >= wd) continue;
            const si = (iy * wd + ix) * cin;
            const wi = ((co * k + ky) * k + kx) * cin;
            for (let ci = 0; ci < cin; ci++) s += src[si + ci] * w[wi + ci];
          }
        }
        out[oi + co] = s;
      }
    }
  }
  return { h: py.out, w: px.out, c: cout, d: out };
}

function meanPool(x: Map3): Float32Array {
  const m = new Float32Array(x.c);
  const n = x.h * x.w;
  for (let p = 0; p < n; p++) for (let ch = 0; ch < x.c; ch++) m[ch] += x.d[p * x.c + ch];
  for (let ch = 0; ch < x.c; ch++) m[ch] /= n;
  return m;
}

/** Squeeze-and-excite: scale each channel by a gate computed from the whole map. */
function squeezeExcite(x: Map3, w1: Float32Array, b1: Float32Array, w2: Float32Array, b2: Float32Array): Map3 {
  const pooled: Map3 = { h: 1, w: 1, c: x.c, d: meanPool(x) };
  const g = pointwise(act(pointwise(pooled, w1, b1), "relu"), w2, b2).d;
  for (let ch = 0; ch < g.length; ch++) g[ch] = Math.min(Math.max(g[ch] + 3, 0), 6) / 6;
  const n = x.h * x.w;
  for (let p = 0; p < n; p++) for (let ch = 0; ch < x.c; ch++) x.d[p * x.c + ch] *= g[ch];
  return x;
}

export class ArtNet {
  readonly height: number;
  readonly width: number;
  private readonly header: Header;
  private readonly t = new Map<string, Float32Array>();

  constructor(buffer: ArrayBuffer | Uint8Array) {
    const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    if (String.fromCharCode(...bytes.subarray(0, 4)) !== "MTGN") throw new Error("Not an art network file");
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const len = view.getUint32(4, true);
    this.header = JSON.parse(new TextDecoder().decode(bytes.subarray(8, 8 + len))) as Header;
    const start = 8 + len + ((8 + len) % 2);
    for (const t of this.header.tensors) {
      const n = t.shape.reduce((a, b) => a * b, 1);
      const out = new Float32Array(n);
      for (let i = 0; i < n; i++) out[i] = HALF[view.getUint16(start + t.offset + i * 2, true)];
      this.t.set(t.name, out);
    }
    [this.height, this.width] = this.header.input;
  }

  private w(name: string): Float32Array {
    const t = this.t.get(name);
    if (!t) throw new Error(`Art network is missing ${name}`);
    return t;
  }

  /** Length of the embedding. */
  get size(): number {
    return this.w("head.b").length;
  }

  /**
   * Embeds an RGBA image that is already `width` x `height` (the art, resized).
   * Returns the network's pooled features (non-negative).
   */
  embed(rgba: Uint8ClampedArray | Uint8Array): Float32Array {
    const { height: h, width: w } = this;
    if (rgba.length !== h * w * 4) throw new Error(`Art network wants ${w}x${h}`);
    const { scale, offset } = this.header;
    const input = new Float32Array(h * w * 3);
    for (let i = 0, j = 0; i < h * w; i++, j += 4) {
      input[i * 3] = rgba[j] * scale + offset;
      input[i * 3 + 1] = rgba[j + 1] * scale + offset;
      input[i * 3 + 2] = rgba[j + 2] * scale + offset;
    }
    let x: Map3 = act(convFull({ h, w, c: 3, d: input }, this.w("stem.w"), this.w("stem.b"), 3, 2), "hswish");
    this.header.blocks.forEach((blk, i) => {
      const inp = x;
      let y = blk.expand ? act(pointwise(x, this.w(`b${i}.expand.w`), this.w(`b${i}.expand.b`)), blk.act) : x;
      y = act(depthwise(y, this.w(`b${i}.dw.w`), this.w(`b${i}.dw.b`), blk.k, blk.stride), blk.act);
      if (blk.se) y = squeezeExcite(y, this.w(`b${i}.se1.w`), this.w(`b${i}.se1.b`), this.w(`b${i}.se2.w`), this.w(`b${i}.se2.b`));
      y = pointwise(y, this.w(`b${i}.project.w`), this.w(`b${i}.project.b`));
      if (blk.stride === 1 && inp.c === y.c) for (let j = 0; j < y.d.length; j++) y.d[j] += inp.d[j];
      x = y;
    });
    x = act(pointwise(x, this.w("head.w"), this.w("head.b")), "hswish");
    return meanPool(x);
  }
}
