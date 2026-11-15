import { describe, expect, it } from "vitest";
import { applyHomography, detectCard, guideRect, rectToQuad, solveHomography, warpQuad, type Quad } from "@/scanner/geometry";
import { hammingHex, pHash } from "@/scanner/hash";
import { encodeGrayBMP, normalizePolarity, otsuThreshold, rotate180, toGray, createGray } from "@/scanner/image";
import { imageHashes } from "@/scanner/identify";
import { fakeCard, placeCard } from "./scanner-helpers";

describe("homography", () => {
  it("maps the four corners exactly", () => {
    const from: Quad = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 140 }, { x: 0, y: 140 }];
    const to: Quad = [{ x: 12, y: 8 }, { x: 108, y: 15 }, { x: 102, y: 160 }, { x: 5, y: 150 }];
    const h = solveHomography(from, to);
    for (let i = 0; i < 4; i++) {
      const p = applyHomography(h, from[i]);
      expect(p.x).toBeCloseTo(to[i].x, 6);
      expect(p.y).toBeCloseTo(to[i].y, 6);
    }
  });
});

describe("card detection", () => {
  const W = 540;
  const H = 960;
  const guide = guideRect(W, H);

  function frameWith(corners: Quad, bg?: [number, number, number]) {
    return placeCard(fakeCard(3), W, H, corners, bg);
  }

  const tilted = (): Quad => {
    const q = rectToQuad({ x: guide.x + 10, y: guide.y + 14, width: guide.width * 0.95, height: guide.height * 0.95 });
    q[1].y -= 8;
    q[2].x += 6;
    return q;
  };

  it("finds a slightly tilted card on a light table", () => {
    const truth = tilted();
    const det = detectCard(frameWith(truth), guide);
    expect(det.usedGuide).toBe(false);
    for (let i = 0; i < 4; i++) {
      expect(Math.abs(det.quad[i].x - truth[i].x)).toBeLessThan(6);
      expect(Math.abs(det.quad[i].y - truth[i].y)).toBeLessThan(6);
    }
  });

  it("finds the outer edge, not the frame inside the black border, on a dark table", () => {
    const truth = tilted();
    const det = detectCard(frameWith(truth, [55, 50, 60]), guide);
    expect(det.usedGuide).toBe(false);
    for (let i = 0; i < 4; i++) expect(Math.hypot(det.quad[i].x - truth[i].x, det.quad[i].y - truth[i].y)).toBeLessThan(8);
  });

  it("falls back to the guide box when there's no card", () => {
    const blank = placeCard(fakeCard(1), W, H, [{ x: -10, y: -10 }, { x: -5, y: -10 }, { x: -5, y: -5 }, { x: -10, y: -5 }]);
    const det = detectCard(blank, guide);
    expect(det.usedGuide).toBe(true);
  });

  it("flattens the detected card back to its original look", () => {
    const card = fakeCard(5);
    const truth = tilted();
    const frame = placeCard(card, W, H, truth);
    const flat = warpQuad(frame, detectCard(frame, guide).quad, card.width, card.height);
    expect(hammingHex(pHash(toGray(flat)), pHash(toGray(card)))).toBeLessThanOrEqual(6);
  });
});

describe("perceptual hash", () => {
  it("is stable for the same art and differs for different art", () => {
    const card = fakeCard(2, 630, 880);
    const a = imageHashes(card);
    const aSmall = imageHashes(warpQuad(card, rectToQuad({ x: 0, y: 0, width: 630, height: 880 }), 244, 340));
    const b = imageHashes(fakeCard(9, 630, 880));
    expect(hammingHex(a.art, aSmall.art)).toBeLessThanOrEqual(8);
    expect(hammingHex(a.art, b.art)).toBeGreaterThan(12);
  });
});

describe("image helpers", () => {
  it("encodes a valid 8-bit BMP", () => {
    const g = createGray(3, 2);
    g.data.set([0, 50, 100, 150, 200, 250]);
    const bmp = encodeGrayBMP(g);
    expect(String.fromCharCode(bmp[0], bmp[1])).toBe("BM");
    const dv = new DataView(bmp.buffer);
    expect(dv.getUint32(2, true)).toBe(bmp.length);
    expect(dv.getInt32(18, true)).toBe(3);
    expect(dv.getInt32(22, true)).toBe(2);
    expect(dv.getUint16(28, true)).toBe(8);
    // bottom-up rows padded to 4 bytes: first stored row is the image's last row
    const off = dv.getUint32(10, true);
    expect([...bmp.slice(off, off + 3)]).toEqual([150, 200, 250]);
  });

  it("turns light text on a dark background into dark on light", () => {
    const g = createGray(10, 10);
    g.data.fill(20);
    g.data.fill(230, 40, 50); // one light row = "text"
    const n = normalizePolarity(g);
    expect(n.data[0]).toBeGreaterThan(200);
    expect(n.data[45]).toBeLessThan(50);
    expect(otsuThreshold(g)).toBeGreaterThanOrEqual(20);
  });

  it("rotates 180 degrees", () => {
    const g = createGray(2, 2);
    g.data.set([1, 2, 3, 4]);
    expect([...rotate180(g).data]).toEqual([4, 3, 2, 1]);
  });
});
