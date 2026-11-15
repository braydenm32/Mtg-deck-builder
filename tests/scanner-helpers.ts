import { applyHomography, solveHomography, type Quad } from "@/scanner/geometry";
import { createRGBA, type RGBAImage } from "@/scanner/image";

/** A fake card: black border, coloured frame, a patterned "art box" seeded by `seed`. */
export function fakeCard(seed: number, w = 315, h = 440): RGBAImage {
  const img = createRGBA(w, h);
  const border = Math.round(w * 0.045);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      let r = 20, g = 20, b = 20;
      const inBorder = x < border || y < border || x >= w - border || y >= h - border;
      if (!inBorder) {
        [r, g, b] = [200, 170, 120]; // frame
        const artX = x / w, artY = y / h;
        if (artX > 0.1 && artX < 0.9 && artY > 0.13 && artY < 0.55) {
          const v = Math.sin((x * (seed + 1)) / 9) * Math.cos((y * (seed + 2)) / 13);
          r = 128 + 120 * v;
          g = 128 + 100 * Math.sin((x + y * seed) / 17);
          b = 128 - 120 * v;
        }
      }
      img.data[i] = r;
      img.data[i + 1] = g;
      img.data[i + 2] = b;
      img.data[i + 3] = 255;
    }
  }
  return img;
}

/** Places `card` into a `fw` x `fh` frame at `corners`, over a flat background. */
export function placeCard(card: RGBAImage, fw: number, fh: number, corners: Quad, bg: [number, number, number] = [210, 205, 195]): RGBAImage {
  const out = createRGBA(fw, fh);
  const src: Quad = [
    { x: 0, y: 0 },
    { x: card.width, y: 0 },
    { x: card.width, y: card.height },
    { x: 0, y: card.height },
  ];
  const h = solveHomography(corners, src);
  for (let y = 0; y < fh; y++) {
    for (let x = 0; x < fw; x++) {
      const p = applyHomography(h, { x: x + 0.5, y: y + 0.5 });
      const o = (y * fw + x) * 4;
      if (p.x >= 0 && p.y >= 0 && p.x < card.width && p.y < card.height) {
        const j = (Math.floor(p.y) * card.width + Math.floor(p.x)) * 4;
        out.data[o] = card.data[j];
        out.data[o + 1] = card.data[j + 1];
        out.data[o + 2] = card.data[j + 2];
      } else {
        [out.data[o], out.data[o + 1], out.data[o + 2]] = bg;
      }
      out.data[o + 3] = 255;
    }
  }
  return out;
}
