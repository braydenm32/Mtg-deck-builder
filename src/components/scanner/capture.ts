/**
 * Browser-side frame handling: grab video frames, find the card, and turn it
 * into a flattened JPEG for the server. Pure canvas, no dependencies.
 */
import { FOIL_FRAME_HEIGHT, FOIL_FRAME_WIDTH } from "@/scanner/foil";
import { CANON_HEIGHT, CANON_WIDTH, CARD_ASPECT, type CardDetection, detectCard, type Quad, warpQuad } from "@/scanner/geometry";
import { pHash } from "@/scanner/hash";
import { type Rect, type RGBAImage, toGray } from "@/scanner/image";
import { detectCardAnywhere } from "@/scanner/locate";

/** Height frames are shrunk to for the live edge search (fast enough at ~5 fps on a phone). */
export const WORK_HEIGHT = 480;

function canvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

/** Draws the current video frame at `scale` and returns its pixels. */
export function grabFrame(video: HTMLVideoElement, scale: number, reuse?: HTMLCanvasElement): { img: RGBAImage; canvas: HTMLCanvasElement } {
  const w = Math.max(1, Math.round(video.videoWidth * scale));
  const h = Math.max(1, Math.round(video.videoHeight * scale));
  const c = reuse && reuse.width === w && reuse.height === h ? reuse : canvas(w, h);
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(video, 0, 0, w, h);
  const data = ctx.getImageData(0, 0, w, h);
  return { img: { width: w, height: h, data: data.data }, canvas: c };
}

export function scaleRect(r: Rect, s: number): Rect {
  return { x: r.x * s, y: r.y * s, width: r.width * s, height: r.height * s };
}

export function scaleQuad(q: Quad, s: number): Quad {
  return q.map((p) => ({ x: p.x * s, y: p.y * s })) as Quad;
}

/** Largest corner movement between two quads, as a fraction of the guide width. */
export function quadDrift(a: Quad, b: Quad, guideWidth: number): number {
  let d = 0;
  for (let i = 0; i < 4; i++) d = Math.max(d, Math.hypot(a[i].x - b[i].x, a[i].y - b[i].y));
  return d / guideWidth;
}

/** A quick fingerprint of the card in view, to avoid re-scanning the same card. */
export function quickHash(frame: RGBAImage, quad: Quad): string {
  return pHash(toGray(warpQuad(frame, quad, 63, 88)));
}

export function detect(frame: RGBAImage, guide: Rect): CardDetection {
  return detectCard(frame, guide);
}

/**
 * Finds the card anywhere in the frame (tower mode: no guide, the card can be
 * small and off-centre). Looks around `near` first (where the card was last
 * frame), which is quicker; searches the whole frame when it isn't there.
 */
export function detectAnywhere(frame: RGBAImage, near?: Quad | null): CardDetection | null {
  if (near) {
    const xs = near.map((p) => p.x);
    const ys = near.map((p) => p.y);
    const guide = { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
    if (guide.width > 20 && guide.height > 20 && guide.height > guide.width) {
      const d = detectCard(frame, guide, { band: 0.08, nearest: true });
      if (!d.usedGuide && d.confidence >= 0.7) return d;
    }
  }
  return detectCardAnywhere(frame);
}

/**
 * A view worth giving the foil check: the whole card is in the frame, and the
 * outline is card-shaped. (A card cut off by the frame edge, or a rough box
 * around a tilted card, puts table or the wrong part of the card into the
 * view, and that reads as a colour change.)
 */
export function goodFoilView(quad: Quad, width: number, height: number, margin = 3): boolean {
  if (!quad.every((p) => p.x >= margin && p.y >= margin && p.x <= width - margin && p.y <= height - margin)) return false;
  const w = (Math.hypot(quad[1].x - quad[0].x, quad[1].y - quad[0].y) + Math.hypot(quad[2].x - quad[3].x, quad[2].y - quad[3].y)) / 2;
  const h = (Math.hypot(quad[3].x - quad[0].x, quad[3].y - quad[0].y) + Math.hypot(quad[2].x - quad[1].x, quad[2].y - quad[1].y)) / 2;
  return h > 0 && Math.abs(w / h / CARD_ASPECT - 1) <= 0.08;
}

/** A small flattened view of the card for the foil check (see scanner/foil.ts). */
export function foilView(frame: RGBAImage, quad: Quad): RGBAImage {
  return warpQuad(frame, quad, FOIL_FRAME_WIDTH, FOIL_FRAME_HEIGHT);
}

export function imageToBlob(img: RGBAImage, type = "image/jpeg", quality = 0.9): Promise<Blob> {
  const c = canvas(img.width, img.height);
  c.getContext("2d")!.putImageData(new ImageData(new Uint8ClampedArray(img.data), img.width, img.height), 0, 0);
  return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't encode image"))), type, quality));
}

/** Full-resolution capture of the card in `quadAtWork` (given in work-scale coordinates). */
export async function captureCard(video: HTMLVideoElement, quadAtWork: Quad, workScale: number): Promise<{ jpeg: Blob; preview: string }> {
  const { img } = grabFrame(video, 1);
  const quad = scaleQuad(quadAtWork, 1 / workScale);
  const card = warpQuad(img, quad, CANON_WIDTH, CANON_HEIGHT);
  const jpeg = await imageToBlob(card, "image/jpeg", 0.92);
  return { jpeg, preview: URL.createObjectURL(jpeg) };
}

/** Hosts cap request bodies (Vercel: 4.5 MB), so bigger photos are shrunk before they're sent. */
export const PHOTO_UPLOAD_MAX_BYTES = 4 * 1024 * 1024;

/**
 * A photo small enough to upload: as it is when it fits, otherwise redrawn at most 3000 px on its
 * long side (what the server scales it to anyway) as a JPEG.
 */
export async function photoForUpload(file: Blob, maxSide = 3000): Promise<Blob> {
  if (file.size <= PHOTO_UPLOAD_MAX_BYTES) return file;
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
    const c = canvas(Math.round(bmp.width * scale), Math.round(bmp.height * scale));
    c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
    bmp.close();
    for (const q of [0.9, 0.8, 0.7]) {
      const b = await new Promise<Blob | null>((r) => c.toBlob(r, "image/jpeg", q));
      if (b && b.size <= PHOTO_UPLOAD_MAX_BYTES) return b;
    }
  } catch {
    // The browser can't decode it (unusual format): send the original and let the server say.
  }
  return file;
}
