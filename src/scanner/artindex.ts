/**
 * Recognising a card from its picture: the artwork goes through the art
 * network (artnet.ts), and the result is compared with every printing's
 * artwork in a prebuilt index (scanner-data/art-index.bin, made by
 * scripts/scanner/build-art-index.mts from Scryfall's small card images).
 *
 * The picture tells which card it is, and usually which artwork, but not which
 * of several reprints with the same artwork: the collector line decides that
 * (identify.ts).
 *
 * Index file: "MTGI", u32 header length, JSON header, padding to 4 bytes,
 * then float32 mean[features], float32 projection[features x dims],
 * 16-byte Scryfall ids [count], int8 vectors [count x dims].
 */
import type { ArtNet } from './artnet';
import { cropFraction, resizeRGBA, type RGBAImage } from './image';
import { ART_REGION } from './layout';

/** Scryfall's "small" image size: the index is made from these. */
export const THUMB_WIDTH = 146;
export const THUMB_HEIGHT = 204;

export interface ArtIndexHeader {
  version: number;
  /** Which network made the vectors (must match the art network file). */
  net: string;
  features: number;
  dims: number;
  count: number;
  /** int8 value = round(component * scale). */
  scale: number;
  builtAt: string;
}

export interface ArtMatch {
  /** Scryfall id of the printing. */
  id: string;
  /** Cosine similarity, about 0.3-0.5 for unrelated art and 0.6-0.9 for the same art in a photo. */
  similarity: number;
}

/**
 * The network's input for a card (any size, upright): its art box, resized. A photo's card is
 * cropped at full size (keeping the detail beats copying the index's blurrier thumbnails: 16 of
 * 20 real photos right instead of 15).
 */
export function artInput(card: RGBAImage, width: number, height: number): RGBAImage {
  return resizeRGBA(cropFraction(card, ART_REGION), width, height);
}

/** Network features -> the index's comparable vector (square root, centred, projected, unit length). */
export function projectFeatures(features: Float32Array, mean: Float32Array, projection: Float32Array, dims: number): Float32Array {
  const f = features.length;
  const centred = new Float32Array(f);
  for (let i = 0; i < f; i++) centred[i] = Math.sqrt(Math.max(features[i], 0)) - mean[i];
  const out = new Float32Array(dims);
  for (let i = 0; i < f; i++) {
    const c = centred[i];
    if (c === 0) continue;
    const row = i * dims;
    for (let d = 0; d < dims; d++) out[d] += c * projection[row + d];
  }
  let n = 0;
  for (let d = 0; d < dims; d++) n += out[d] * out[d];
  n = Math.sqrt(n) || 1;
  for (let d = 0; d < dims; d++) out[d] /= n;
  return out;
}

function hex(bytes: Uint8Array, at: number): string {
  let s = "";
  for (let i = 0; i < 16; i++) {
    s += bytes[at + i].toString(16).padStart(2, "0");
    if (i === 3 || i === 5 || i === 7 || i === 9) s += "-";
  }
  return s;
}

export function uuidBytes(id: string): Uint8Array {
  const h = id.replace(/-/g, "");
  if (!/^[0-9a-f]{32}$/i.test(h)) throw new Error(`Not a Scryfall id: ${id}`);
  const out = new Uint8Array(16);
  for (let i = 0; i < 16; i++) out[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/** Writes an index file (the build script and tests). `vectors` are unit vectors, count x dims. */
export function encodeArtIndex(opts: {
  net: string;
  mean: Float32Array;
  projection: Float32Array;
  ids: string[];
  vectors: Float32Array;
  builtAt?: string;
}): Uint8Array {
  const features = opts.mean.length;
  const dims = opts.projection.length / features;
  const count = opts.ids.length;
  let maxAbs = 1e-9;
  for (const v of opts.vectors) maxAbs = Math.max(maxAbs, Math.abs(v));
  const scale = 127 / maxAbs;
  const header: ArtIndexHeader = { version: 1, net: opts.net, features, dims, count, scale, builtAt: opts.builtAt ?? new Date().toISOString() };
  const head = new TextEncoder().encode(JSON.stringify(header));
  let at = 8 + head.length;
  at += (4 - (at % 4)) % 4;
  const out = new Uint8Array(at + (features + features * dims) * 4 + count * (16 + dims));
  out.set([77, 84, 71, 73]); // "MTGI"
  new DataView(out.buffer).setUint32(4, head.length, true);
  out.set(head, 8);
  out.set(new Uint8Array(Float32Array.from(opts.mean).buffer), at);
  at += features * 4;
  out.set(new Uint8Array(Float32Array.from(opts.projection).buffer), at);
  at += features * dims * 4;
  opts.ids.forEach((id, i) => out.set(uuidBytes(id), at + i * 16));
  at += count * 16;
  const q = new Int8Array(out.buffer, at, count * dims);
  for (let i = 0; i < count * dims; i++) q[i] = Math.round(opts.vectors[i] * scale);
  return out;
}

export class ArtIndex {
  readonly header: ArtIndexHeader;
  readonly mean: Float32Array;
  readonly projection: Float32Array;
  private readonly ids: Uint8Array;
  private readonly vectors: Int8Array;

  constructor(buffer: ArrayBuffer | Uint8Array) {
    const src = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    if (String.fromCharCode(...src.subarray(0, 4)) !== "MTGI") throw new Error("Not an art index file");
    const len = new DataView(src.buffer, src.byteOffset, src.byteLength).getUint32(4, true);
    this.header = JSON.parse(new TextDecoder().decode(src.subarray(8, 8 + len))) as ArtIndexHeader;
    const { features, dims, count } = this.header;
    let at = 8 + len;
    at += (4 - (at % 4)) % 4;
    // Copy into aligned arrays (the file's buffer may start anywhere).
    const floats = (n: number) => {
      const out = new Float32Array(n);
      new Uint8Array(out.buffer).set(src.subarray(at, at + n * 4));
      at += n * 4;
      return out;
    };
    this.mean = floats(features);
    this.projection = floats(features * dims);
    if (src.length < at + count * (16 + dims)) throw new Error("Art index file is cut short");
    // Copies, not views: a Node Buffer's slice shares (and may start partway into) a bigger buffer.
    this.ids = new Uint8Array(count * 16);
    this.ids.set(src.subarray(at, at + count * 16));
    at += count * 16;
    this.vectors = new Int8Array(count * dims);
    new Uint8Array(this.vectors.buffer).set(src.subarray(at, at + count * dims));
  }

  get size(): number {
    return this.header.count;
  }

  id(row: number): string {
    return hex(this.ids, row * 16);
  }

  vector(features: Float32Array): Float32Array {
    return projectFeatures(features, this.mean, this.projection, this.header.dims);
  }

  /** The `k` printings whose art is most like `vec` (a unit vector from `vector`), best first. */
  search(vec: Float32Array, k = 40): ArtMatch[] {
    const { dims, count, scale } = this.header;
    const v = this.vectors;
    const topSim = new Float32Array(k).fill(-Infinity);
    const topRow = new Int32Array(k).fill(-1);
    let floor = -Infinity;
    for (let r = 0, o = 0; r < count; r++, o += dims) {
      let s = 0;
      for (let d = 0; d < dims; d++) s += vec[d] * v[o + d];
      if (s <= floor) continue;
      // Insert into the sorted top list.
      let i = k - 1;
      while (i > 0 && topSim[i - 1] < s) {
        topSim[i] = topSim[i - 1];
        topRow[i] = topRow[i - 1];
        i--;
      }
      topSim[i] = s;
      topRow[i] = r;
      floor = topSim[k - 1];
    }
    const out: ArtMatch[] = [];
    for (let i = 0; i < k && topRow[i] >= 0; i++) out.push({ id: this.id(topRow[i]), similarity: topSim[i] / scale });
    return out;
  }
}

/** Network + index: card picture in, the most similar printings out. */
export class ArtRecognizer {
  constructor(
    readonly net: ArtNet,
    readonly index: ArtIndex,
  ) {}

  /** Vector for a flattened, upright card (any size). */
  vectorFor(card: RGBAImage): Float32Array {
    const input = artInput(card, this.net.width, this.net.height);
    return this.index.vector(this.net.embed(input.data));
  }

  match(card: RGBAImage, k = 40): ArtMatch[] {
    return this.index.search(this.vectorFor(card), k);
  }
}
