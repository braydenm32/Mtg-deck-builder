/**
 * Browser-side frame handling: grab video frames, find the card, and turn it
 * into a flattened JPEG for the server. Pure canvas, no dependencies.
 */
import { CANON_HEIGHT, CANON_WIDTH, type CardDetection, detectCard, type Quad, warpQuad } from "@/scanner/geometry";
import { pHash } from "@/scanner/hash";
import { type Rect, type RGBAImage, toGray } from "@/scanner/image";

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
