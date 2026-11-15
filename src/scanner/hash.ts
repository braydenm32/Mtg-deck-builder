/**
 * Perceptual hashes, used to tell printings of the same card apart (different
 * art, frames or borders) by comparing the photo with Scryfall's images.
 */
import { type GrayImage, resizeGray } from './image';

const N = 32;
const K = 8;

let cosTable: Float64Array | null = null;
function cosines(): Float64Array {
  if (!cosTable) {
    cosTable = new Float64Array(K * N);
    for (let u = 0; u < K; u++) {
      for (let x = 0; x < N; x++) cosTable[u * N + x] = Math.cos(((2 * x + 1) * u * Math.PI) / (2 * N));
    }
  }
  return cosTable;
}

/**
 * 64-bit DCT perceptual hash (pHash), returned as 16 hex characters.
 * Robust to scaling, blur, JPEG and moderate lighting changes.
 */
export function pHash(img: GrayImage): string {
  const small = resizeGray(img, N, N);
  const c = cosines();
  // separable 2D DCT, low 8x8 frequencies only
  const rows = new Float64Array(N * K);
  for (let y = 0; y < N; y++) {
    for (let u = 0; u < K; u++) {
      let s = 0;
      for (let x = 0; x < N; x++) s += small.data[y * N + x] * c[u * N + x];
      rows[y * K + u] = s;
    }
  }
  const coeffs: number[] = [];
  for (let v = 0; v < K; v++) {
    for (let u = 0; u < K; u++) {
      let s = 0;
      for (let y = 0; y < N; y++) s += rows[y * K + u] * c[v * N + y];
      coeffs.push(s);
    }
  }
  const ac = coeffs.slice(1); // ignore DC (overall brightness)
  const med = [...ac].sort((a, b) => a - b)[Math.floor(ac.length / 2)];
  let hex = '';
  for (let i = 0; i < 64; i += 4) {
    let nibble = 0;
    for (let b = 0; b < 4; b++) nibble = (nibble << 1) | (coeffs[i + b] > med ? 1 : 0);
    hex += nibble.toString(16);
  }
  return hex;
}

/** Number of differing bits between two hex hashes of equal length. */
export function hammingHex(a: string, b: string): number {
  let d = 0;
  for (let i = 0; i < a.length; i++) {
    let x = parseInt(a[i], 16) ^ parseInt(b[i], 16);
    while (x) {
      d += x & 1;
      x >>= 1;
    }
  }
  return d;
}
