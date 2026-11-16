import { FOIL_FRAME_HEIGHT as H, FOIL_FRAME_WIDTH as W } from "@/scanner/foil";
import type { RGBAImage } from "@/scanner/image";

/** Simulated phone views of a card being tilted, for the foil check tests. */

/** Small seeded random numbers, so every run sees the same "footage". */
export function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

type RGB = [number, number, number];

/** A made-up card face: black border, colourful art blocks, pale text box with dark lines. */
function cardFace(seed: number): (x: number, y: number) => RGB {
  const rand = rng(seed);
  const palette: RGB[] = Array.from({ length: 6 }, () => [rand() * 220 + 20, rand() * 220 + 20, rand() * 220 + 20]);
  const blocks = Array.from({ length: 24 }, () => palette[Math.floor(rand() * palette.length)]);
  const frame: RGB = [rand() * 120 + 100, rand() * 120 + 100, rand() * 120 + 60];
  return (x, y) => {
    const u = x / W;
    const v = y / H;
    if (u < 0.05 || u > 0.95 || v < 0.035 || v > 0.965) return [18, 18, 20];
    if (v > 0.11 && v < 0.55 && u > 0.09 && u < 0.91) {
      const bx = Math.floor(((u - 0.09) / 0.82) * 6);
      const by = Math.floor(((v - 0.11) / 0.44) * 4);
      return blocks[by * 6 + bx];
    }
    if (v > 0.62 && v < 0.9 && u > 0.09 && u < 0.91) {
      const line = Math.floor((v - 0.62) * H) % 5 === 0 && u < 0.8;
      return line ? [40, 38, 36] : [228, 222, 205];
    }
    return frame;
  };
}

function hue(h: number): RGB {
  const f = (n: number) => {
    const k = (n + h * 6) % 6;
    return 1 - Math.max(0, Math.min(k, 4 - k, 1));
  };
  return [f(5), f(3), f(1)];
}

interface Shot {
  /** Overall exposure, and per-channel white balance. */
  gain: number;
  wb: RGB;
  /** Glare: a soft white spot at (gx, gy) as fractions of the card, `glare` 0..255 (linear light) at its centre. */
  gx: number;
  gy: number;
  glare: number;
  /** Rainbow sheen strength at its band (0 = none, 0..255 linear light) and where the band and its colours sit. */
  sheen: number;
  band: number;
  phase: number;
  /** Edge-fit wobble, in pixels. */
  dx: number;
  dy: number;
  noise: number;
}

function render(face: (x: number, y: number) => RGB, shot: Shot, rand: () => number): RGBAImage {
  const data = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const sx = Math.min(W - 1, Math.max(0, Math.round(x + shot.dx)));
      const sy = Math.min(H - 1, Math.max(0, Math.round(y + shot.dy)));
      const base = face(sx, sy);
      const u = x / W;
      const v = y / H;
      const g = shot.glare * Math.exp(-((u - shot.gx) ** 2 + (v - shot.gy) ** 2) / (2 * 0.12 ** 2));
      // Foil: a diagonal band of rainbow light that sweeps as the card tilts.
      const along = (u + v) / 2;
      const strength = shot.sheen * Math.exp(-((along - shot.band) ** 2) / (2 * 0.12 ** 2));
      const rainbow = hue((along * 6 + shot.phase) % 1);
      // Light adds up in linear light; the camera then encodes it as sRGB-ish (gamma 2.2).
      for (let c = 0; c < 3; c++) {
        const lit = (base[c] / 255) ** 2.2 * shot.gain * shot.wb[c] + g / 255 + (strength / 255) * rainbow[c];
        data[(y * W + x) * 4 + c] = 255 * Math.min(1, lit) ** (1 / 2.2) + (rand() - 0.5) * 2 * shot.noise;
      }
      data[(y * W + x) * 4 + 3] = 255;
    }
  }
  return { width: W, height: H, data };
}

/** A card being tilted: glare wanders, the phone re-exposes, the edge fit wobbles, and (if foil) the sheen sweeps. */
export function tilt(seed: number, foil: boolean, frames = 10, opts: { sheen?: number; still?: boolean } = {}): RGBAImage[] {
  const rand = rng(seed * 7919 + 13);
  const face = cardFace(seed);
  const out: RGBAImage[] = [];
  for (let i = 0; i < frames; i++) {
    const t = i / (frames - 1);
    const moving = opts.still ? 0 : 1;
    out.push(
      render(
        face,
        {
          gain: 1 + moving * (rand() - 0.5) * 0.3,
          wb: [1 + moving * (rand() - 0.5) * 0.1, 1, 1 + moving * (rand() - 0.5) * 0.1],
          gx: 0.2 + 0.6 * t,
          gy: 0.3 + 0.4 * rand(),
          glare: moving ? 30 + rand() * 90 : 0,
          sheen: foil ? (opts.sheen ?? 50) * (moving ? 1 : 0.5) : 0,
          band: opts.still ? 0.5 : 0.1 + 0.8 * t,
          phase: opts.still ? 0 : t * 0.8,
          dx: moving ? Math.round((rand() - 0.5) * 2) : 0,
          dy: moving ? Math.round((rand() - 0.5) * 2) : 0,
          noise: 6,
        },
        rand,
      ),
    );
  }
  return out;
}

