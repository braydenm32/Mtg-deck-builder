import { describe, expect, it } from "vitest";
import { qrMatrix, qrPath } from "@/lib/qr";

// A finder pattern: the 7x7 square in three corners that cameras look for.
const finder = (m: boolean[][], r0: number, c0: number) =>
  Array.from({ length: 7 }, (_, r) =>
    Array.from({ length: 7 }, (_, c) => m[r0 + r][c0 + c]).every((v, c) => v === (r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4))),
  ).every(Boolean);

describe("QR codes", () => {
  it("draws a standard code with its three finder patterns", () => {
    const m = qrMatrix("https://example.app/collection?loc=Binder%201");
    const n = m.length;
    expect((n - 17) % 4).toBe(0);
    expect(finder(m, 0, 0) && finder(m, 0, n - 7) && finder(m, n - 7, 0)).toBe(true);
  });

  it("grows with the text, and fits a two-step setup link", () => {
    const short = qrMatrix("https://x.app/s/abc").length;
    const otp = qrMatrix("otpauth://totp/MTG%20Deck%20Tutor?secret=JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP&issuer=MTG%20Deck%20Tutor&algorithm=SHA1&digits=6&period=30").length;
    expect(otp).toBeGreaterThan(short);
    expect(otp).toBeLessThanOrEqual(57);
  });

  it("makes one path with a quiet zone, covering exactly the dark modules", () => {
    const text = "Déjà vu";
    const m = qrMatrix(text);
    const { size, d } = qrPath(text);
    expect(size).toBe(m.length + 8);
    let dark = 0;
    for (const x of d.matchAll(/M(\d+) (\d+)h(\d+)/g)) {
      expect(+x[1]).toBeGreaterThanOrEqual(4);
      dark += +x[3];
    }
    expect(dark).toBe(m.flat().filter(Boolean).length);
  });
});
