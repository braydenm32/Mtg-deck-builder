/**
 * Fakes a phone-camera photo of a card from a Scryfall scan: the card placed
 * roughly in the guide box with tilt, perspective jitter and scale, over a
 * table-like background, with uneven light, colour cast, noise, blur and JPEG.
 * Used by scan-eval.mts to measure recognition without a pile of real photos.
 */
import sharp from "sharp";
import { applyHomography, guideRect, solveHomography, type Quad } from "../../src/scanner/geometry";
import type { RGBAImage } from "../../src/scanner/image";

export function rng(seed: number) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

export async function loadRGBA(input: string | Buffer): Promise<RGBAImage> {
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { width: info.width, height: info.height, data: new Uint8ClampedArray(data.buffer, data.byteOffset, data.length) };
}

export interface SimOptions {
  frameW: number;
  frameH: number;
  /** Corner jitter as a fraction of the guide width (perspective). */
  jitter: number;
  /** Max rotation either way, degrees. */
  rotDeg: number;
  blur: number;
  noise: number;
  jpeg: number;
}

export const PROFILES: Record<string, SimOptions> = {
  clean: { frameW: 1080, frameH: 1920, jitter: 0, rotDeg: 0, blur: 0, noise: 0, jpeg: 92 },
  normal: { frameW: 1080, frameH: 1920, jitter: 0.02, rotDeg: 2, blur: 0.8, noise: 10, jpeg: 80 },
  hard: { frameW: 720, frameH: 1280, jitter: 0.035, rotDeg: 4, blur: 1.2, noise: 16, jpeg: 70 },
};

export async function simulatePhoto(card: RGBAImage, o: SimOptions, r: () => number): Promise<RGBAImage> {
  const g = guideRect(o.frameW, o.frameH);
  const cx = g.x + g.width / 2;
  const cy = g.y + g.height / 2;
  const th = (((r() - 0.5) * 2 * o.rotDeg) * Math.PI) / 180;
  const sc = 0.92 + r() * 0.12;
  const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sy]) => {
    const x = ((sx * g.width) / 2) * sc;
    const y = ((sy * g.height) / 2) * sc;
    return {
      x: cx + x * Math.cos(th) - y * Math.sin(th) + (r() - 0.5) * 2 * o.jitter * g.width,
      y: cy + x * Math.sin(th) + y * Math.cos(th) + (r() - 0.5) * 2 * o.jitter * g.width,
    };
  }) as Quad;
  const src: Quad = [{ x: 0, y: 0 }, { x: card.width, y: 0 }, { x: card.width, y: card.height }, { x: 0, y: card.height }];
  const h = solveHomography(corners, src);
  const out = new Uint8ClampedArray(o.frameW * o.frameH * 4);
  const kind = Math.floor(r() * 3);
  const base = kind === 0 ? [205, 200, 190] : kind === 1 ? [40, 38, 45] : [140, 95, 60];
  const rad = card.width * 0.045;
  for (let y = 0; y < o.frameH; y++) {
    for (let x = 0; x < o.frameW; x++) {
      const i = (y * o.frameW + x) * 4;
      const p = applyHomography(h, { x: x + 0.5, y: y + 0.5 });
      let inside = p.x >= 0 && p.y >= 0 && p.x < card.width && p.y < card.height;
      if (inside) {
        const qx = Math.min(p.x, card.width - p.x);
        const qy = Math.min(p.y, card.height - p.y);
        if (qx < rad && qy < rad && Math.hypot(rad - qx, rad - qy) > rad) inside = false; // rounded corners
      }
      if (inside) {
        const j = (Math.min(card.height - 1, Math.floor(p.y)) * card.width + Math.min(card.width - 1, Math.floor(p.x))) * 4;
        out[i] = card.data[j];
        out[i + 1] = card.data[j + 1];
        out[i + 2] = card.data[j + 2];
      } else {
        const grain = kind === 2 ? 18 * Math.sin(y * 0.05 + Math.sin(x * 0.01) * 3) : 0;
        out[i] = base[0] + grain;
        out[i + 1] = base[1] + grain;
        out[i + 2] = base[2] + grain;
      }
      out[i + 3] = 255;
    }
  }
  const gain = 0.75 + r() * 0.45;
  const castR = 0.95 + r() * 0.1;
  const castB = 0.9 + r() * 0.15;
  const gx = (r() - 0.5) * 0.4;
  for (let y = 0; y < o.frameH; y++) {
    for (let x = 0; x < o.frameW; x++) {
      const i = (y * o.frameW + x) * 4;
      const l = gain * (1 + gx * (x / o.frameW - 0.5));
      out[i] = out[i] * l * castR + (r() - 0.5) * o.noise;
      out[i + 1] = out[i + 1] * l + (r() - 0.5) * o.noise;
      out[i + 2] = out[i + 2] * l * castB + (r() - 0.5) * o.noise;
    }
  }
  let img = sharp(Buffer.from(out.buffer), { raw: { width: o.frameW, height: o.frameH, channels: 4 } });
  if (o.blur > 0.3) img = img.blur(o.blur);
  return loadRGBA(await img.jpeg({ quality: o.jpeg }).toBuffer());
}
