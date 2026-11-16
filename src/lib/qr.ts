import qrcode from "qrcode-generator";

/**
 * QR codes for box labels, the two-step setup and a deck's read-only link, drawn as one SVG path
 * (qrcode-generator makes the matrix; nothing is fetched). Text is encoded as UTF-8.
 */

export type QrLevel = "L" | "M" | "Q" | "H";

/** The code's modules: true is dark. Medium error correction survives a scuffed or curled label. */
export function qrMatrix(text: string, level: QrLevel = "M"): boolean[][] {
  qrcode.stringToBytes = qrcode.stringToBytesFuncs["UTF-8"];
  const qr = qrcode(0, level);
  qr.addData(text, "Byte");
  qr.make();
  const n = qr.getModuleCount();
  return Array.from({ length: n }, (_, r) => Array.from({ length: n }, (_, c) => qr.isDark(r, c)));
}

/**
 * One path for the dark modules (each row's runs merged), in module units, with a quiet zone of
 * `margin` modules all round, as the standard asks (4).
 */
export function qrPath(text: string, { level = "M", margin = 4 }: { level?: QrLevel; margin?: number } = {}): { size: number; d: string } {
  const m = qrMatrix(text, level);
  let d = "";
  m.forEach((row, r) => {
    for (let c = 0; c < row.length; c++) {
      if (!row[c]) continue;
      let end = c;
      while (end + 1 < row.length && row[end + 1]) end++;
      d += `M${c + margin} ${r + margin}h${end - c + 1}v1h-${end - c + 1}z`;
      c = end;
    }
  });
  return { size: m.length + margin * 2, d };
}
