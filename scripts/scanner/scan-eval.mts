/**
 * Measures card recognition on simulated phone photos.
 *
 *   npx tsx scripts/scanner/scan-eval.mts [profile=normal] [count=120] [--verbose]
 *
 * Downloads a fixed, varied sample of cards from Scryfall once (all frame eras,
 * borderless, showcase, extended art, double-faced) into data/scan-eval/, fakes
 * a photo of each (see simulate.mts), runs the same recogniser the app uses
 * against your local card database, and prints accuracy. Needs `npm run sync:cards` first.
 * Profiles: clean, normal (1080p, slight tilt/blur), hard (720p, more tilt/blur/noise).
 */
import fs from "node:fs";
import path from "node:path";
import { openDb } from "../../src/db/client";
import { scanFrame } from "../../src/scanner/identify";
import { getRecognizerDeps } from "../../src/scanner/server";
import { loadRGBA, PROFILES, rng, simulatePhoto } from "./simulate.mts";

const UA = "mtg-deck-builder/0.1 (personal collection app; scan-eval)";
const DIR = path.join(process.cwd(), "data", "scan-eval");
const profile = process.argv[2] ?? "normal";
const count = Number(process.argv[3] ?? 120);
const verbose = process.argv.includes("--verbose");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Sample { tag: string; id: string; oracleId: string; name: string; set: string; cn: string; file: string }

const BASE = "game:paper lang:en -set_type:art_series -set_type:token -set_type:memorabilia -set_type:minigame -is:oversized";
const GROUPS: [string, string, number][] = [
  ["2015 frame", "frame:2015 year<2023 -is:borderless -is:showcase -is:extendedart", 30],
  ["2023+ collector line", "frame:2015 year>=2023 -is:borderless -is:showcase -is:extendedart", 30],
  ["2003 frame", "frame:2003", 12],
  ["1997 frame", "frame:1997", 8],
  ["1993 frame", "frame:1993", 6],
  ["borderless", "is:borderless", 10],
  ["showcase", "is:showcase -is:borderless", 8],
  ["extended art", "is:extendedart", 8],
  ["double-faced", "is:transform frame:2015", 8],
];

async function sample(): Promise<Sample[]> {
  const index = path.join(DIR, "cards.json");
  if (fs.existsSync(index)) return JSON.parse(fs.readFileSync(index, "utf8"));
  fs.mkdirSync(DIR, { recursive: true });
  const out: Sample[] = [];
  const seen = new Set<string>();
  for (const [tag, q, n] of GROUPS) {
    let got = 0;
    for (let tries = 0; got < n && tries < n * 3; tries++) {
      const res = await fetch("https://api.scryfall.com/cards/random?q=" + encodeURIComponent(`${BASE} ${q}`), {
        headers: { "User-Agent": UA, Accept: "application/json" },
      });
      await sleep(550); // Scryfall: 2 requests/second on this endpoint
      if (!res.ok) continue;
      const c = await res.json();
      const img = c.image_uris?.large ?? c.card_faces?.[0]?.image_uris?.large;
      if (!img || seen.has(c.oracle_id)) continue;
      seen.add(c.oracle_id);
      const file = path.join(DIR, `${c.id}.jpg`);
      fs.writeFileSync(file, Buffer.from(await (await fetch(img, { headers: { "User-Agent": UA } })).arrayBuffer()));
      out.push({ tag, id: c.id, oracleId: c.oracle_id, name: c.name, set: c.set, cn: c.collector_number, file });
      got++;
    }
    console.log(`downloaded ${tag}: ${got}`);
  }
  fs.writeFileSync(index, JSON.stringify(out, null, 1));
  return out;
}

const cards = (await sample()).slice(0, count);
const db = await openDb();
const deps = await getRecognizerDeps(db);
const r = rng(42);
const stats = { n: 0, card: 0, printing: 0, auto: 0, autoWrong: 0 };
const byTag = new Map<string, [number, number, number]>();
const misses: string[] = [];
const times: number[] = [];
for (const c of cards) {
  const frame = await simulatePhoto(await loadRGBA(c.file), PROFILES[profile], r);
  const t = Date.now();
  const res = await scanFrame(frame, deps);
  times.push(Date.now() - t);
  const cardOk = res.best?.printing.oracleId === c.oracleId;
  const printOk = res.best?.printing.scryfallId === c.id;
  stats.n++;
  stats.card += +cardOk;
  stats.printing += +printOk;
  if (res.status === "matched") {
    stats.auto++;
    if (!printOk) stats.autoWrong++;
  }
  const t3 = byTag.get(c.tag) ?? [0, 0, 0];
  byTag.set(c.tag, [t3[0] + 1, t3[1] + +cardOk, t3[2] + +printOk]);
  if (!printOk) {
    misses.push(`  ${c.name} [${c.set} ${c.cn}] -> ${res.status}: ${res.best ? `${res.best.printing.name} [${res.best.printing.set} ${res.best.printing.collectorNumber}]` : "nothing"}`);
    if (verbose) misses.push(`      name ${JSON.stringify(res.read.nameText)} col ${JSON.stringify(res.read.collectorText)} (c) ${JSON.stringify(res.read.copyrightText ?? "")}`);
  }
}
const pct = (k: number) => `${((100 * k) / stats.n).toFixed(1)}%`;
times.sort((a, b) => a - b);
console.log(`\nprofile ${profile}, ${stats.n} cards, median ${times[Math.floor(times.length / 2)]} ms/scan`);
console.log(`right card:     ${stats.card} (${pct(stats.card)})`);
console.log(`exact printing: ${stats.printing} (${pct(stats.printing)})`);
console.log(`auto-added:     ${stats.auto} (${pct(stats.auto)}), of which wrong printing: ${stats.autoWrong}`);
for (const [tag, [n, a, b]] of byTag) console.log(`  ${tag.padEnd(22)} ${a}/${n} card, ${b}/${n} printing`);
if (misses.length) console.log("\nmisses:\n" + misses.join("\n"));
process.exit(0);
