/**
 * Measures recognition on real phone photos.
 *
 *   npm run scan:real -- [dir=data/scan-real] [--dump] [--only=<file prefix>] [--no-art]
 *
 * The folder holds photos plus expected.json:
 *   [{ "file": "x.jpg", "name": "...", "set": "neo", "cn": "59", "lang": "ja", "finish": "foil" }]
 * Each photo goes through the same path as "Scan from photos" (POST /api/scan?kind=photo).
 * --dump writes the flattened card each photo produced to <dir>/out/ for eyeballing.
 * --no-art reads every card by its text, as before picture recognition.
 */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { openDb } from "../../src/db/client";
import { extractCard, identifyCard } from "../../src/scanner/identify";
import { decodeImage, getRecognizerDeps } from "../../src/scanner/server";

interface Expected { file: string; name: string; set: string; cn: string; lang: string; finish: string }

const args = process.argv.slice(2);
const dir = args.find((a) => !a.startsWith("--")) ?? path.join("data", "scan-real");
const dump = args.includes("--dump");
const only = args.find((a) => a.startsWith("--only="))?.slice(7);
const expected: Expected[] = JSON.parse(fs.readFileSync(path.join(dir, "expected.json"), "utf8")).filter(
  (e: Expected) => !only || e.file.startsWith(only),
);
if (dump) fs.mkdirSync(path.join(dir, "out"), { recursive: true });

const db = await openDb();
const deps = await getRecognizerDeps(db);
if (args.includes("--no-art")) delete deps.art;
const s = { n: 0, card: 0, printing: 0, auto: 0, autoWrong: 0, lang: 0, byArt: 0 };
const times: number[] = [];
for (const e of expected) {
  const raw = fs.readFileSync(path.join(dir, e.file));
  const resized = await sharp(raw).rotate().resize({ height: 3000, width: 3000, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 92 }).toBuffer();
  const frame = await decodeImage(resized);
  const t = Date.now();
  const { card, detection } = extractCard(frame);
  const res = await identifyCard(card, deps);
  times.push(Date.now() - t);
  const p = res.best?.printing;
  const cardOk = !!p && p.name.split(" // ")[0].toLowerCase() === e.name.toLowerCase();
  const printOk = cardOk && p!.set === e.set && p!.collectorNumber === e.cn;
  const lang = res.lang ?? "?";
  const finish = "nonfoil"; // not detected yet: the finish comes from the scan settings
  s.n++;
  s.card += +cardOk;
  s.printing += +printOk;
  s.lang += +(lang === e.lang);
  s.byArt += +!!res.art?.sure;
  if (res.status === "matched") {
    s.auto++;
    if (!printOk) s.autoWrong++;
  }
  const mark = printOk ? "OK  " : cardOk ? "CARD" : "MISS";
  console.log(
    `${mark} ${e.name} [${e.set} ${e.cn} ${e.lang}${e.finish === "foil" ? " foil" : ""}] -> ${res.status}: ${p ? `${p.name} [${p.set} ${p.collectorNumber}]` : "nothing"}` +
      ` | lang ${lang}${finish === "foil" ? " foil" : ""} | det ${detection.usedGuide ? "GUIDE" : detection.confidence.toFixed(2)}` +
      (res.art ? ` | art ${res.art.sure ? "SURE" : "unsure"} ${res.art.similarity.toFixed(2)} +${res.art.margin.toFixed(2)} ${JSON.stringify(res.art.name.slice(0, 24))}` : "") +
      ` | ${Date.now() - t} ms` +
      ` | name(${res.read.nameConfidence.toFixed(0)}, ${(res.read.nameMatches[0]?.score ?? 0).toFixed(2)}) ${JSON.stringify(res.read.nameText.slice(0, 40))} | col ${JSON.stringify(res.read.collectorText.replace(/\n/g, " / ").slice(0, 60))}` +
      (res.read.copyrightText !== undefined ? ` | (c) ${JSON.stringify(res.read.copyrightText.replace(/\n/g, " / "))}` : ""),
  );
  if (dump) {
    await sharp(Buffer.from(card.data.buffer), { raw: { width: card.width, height: card.height, channels: 4 } })
      .jpeg()
      .toFile(path.join(dir, "out", e.file));
  }
}
const pct = (k: number) => `${k}/${s.n} (${((100 * k) / s.n).toFixed(0)}%)`;
times.sort((a, b) => a - b);
console.log(`\n${s.n} photos, median ${times[Math.floor(times.length / 2)]} ms/scan`);
console.log(`right card:     ${pct(s.card)}`);
console.log(`exact printing: ${pct(s.printing)}`);
console.log(`language:       ${pct(s.lang)}`);
console.log(`auto-added:     ${pct(s.auto)}, of which wrong printing: ${s.autoWrong}`);
console.log(`named by picture: ${pct(s.byArt)}`);
process.exit(0);
