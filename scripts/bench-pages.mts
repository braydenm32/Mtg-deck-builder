/**
 * Dev benchmark: how long each page takes to come back from the server, as Brayden's phone sees it
 * on the hosted app, minus the trip to Tokyo. Runs the production build (`npm run build` first)
 * against a scratch copy of data/mtg.db holding a seeded collection and decks, with a delay added to
 * every database round trip (DB_LATENCY_MS, see src/db/client.ts), and reports per page:
 *   - the time to the whole page (a full load, and a tapped link, which fetches only the page's data)
 *   - database round trips, and the slowest external call it waited on
 *
 *   npx tsx scripts/bench-pages.mts [--latency 8] [--cards 6000] [--decks 8] [--live] [--runs 2]
 *
 * --live lets pages call EDHREC and Commander Spellbook as they would on Vercel (off by default, so
 * the numbers show the app's own cost). Seeding builds the decks with EDHREC when --live is set.
 * --db <file> keeps the seeded database there and reuses it next time (seeding takes a while).
 * --only "Today,Decks" times just those pages; --trace prints each page's queries.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createClient } from "@libsql/client";
import { sql } from "drizzle-orm";
import { openDb } from "@/db/client";
import { importCollection } from "@/lib/collection/import";
import { createDeck, rebuildDeck, setDeckStatus } from "@/lib/deck/store";

const arg = (name: string, dflt: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : dflt;
};
const latency = Number(arg("latency", "8"));
const cardCount = Number(arg("cards", "6000"));
const deckCount = Number(arg("decks", "8"));
const runs = Number(arg("runs", "2"));
const live = process.argv.includes("--live");
const port = Number(arg("port", "3457"));
const only = arg("only", "").split(",").filter(Boolean);
const showTrace = process.argv.includes("--trace");
const keep = arg("db", "");

if (!fs.existsSync(path.join(process.cwd(), ".next", "BUILD_ID"))) {
  console.error("No production build. Run `npm run build` first.");
  process.exit(1);
}

// ---------- 1. A scratch database with a collection and decks ----------
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bench-pages-"));
const file = path.join(dir, "bench.db");
process.env.EDHREC_ENABLED = String(live);
process.env.SPELLBOOK_ENABLED = "false";
if (keep && fs.existsSync(keep)) {
  fs.copyFileSync(keep, file);
} else {
  fs.copyFileSync(path.join(process.cwd(), "data", "mtg.db"), file);
  for (const ext of ["-wal", "-shm"]) if (fs.existsSync(`data/mtg.db${ext}`)) fs.copyFileSync(`data/mtg.db${ext}`, `${file}${ext}`);
  await seed(file);
  if (keep) fs.copyFileSync(file, keep);
}

async function seed(file: string) {
  const seedDb = await openDb(`file:${file}`);
  for (const t of ["deck_cards", "decks", "collection_items", "unmatched_rows", "import_batches"]) await seedDb.run(sql.raw(`DELETE FROM ${t}`));
  // Commander-legal paper printings, one per card, like a real collection (lots of commons, some rares).
  const sample = (
    await seedDb.$client.execute({
      sql: `SELECT p.name, p.set_code, p.collector_number FROM printings p JOIN cards c ON c.oracle_id = p.oracle_id
            WHERE p.lang = 'en' AND c.legal_commander = 'legal' AND c.paper = 1 GROUP BY p.oracle_id ORDER BY random() LIMIT ?`,
      args: [cardCount],
    })
  ).rows;
  const csv = [
    '"Count","Tradelist Count","Name","Edition","Condition","Language","Foil","Collector Number"',
    ...sample.map((r, i) => `"${1 + (i % 3 === 0 ? 1 : 0)}","0","${String(r.name).replace(/"/g, '""')}","${r.set_code}","Near Mint","English","","${r.collector_number}"`),
  ].join("\n");
  const t0 = Date.now();
  const imported = await importCollection(seedDb, { text: csv, online: false });
  console.log(`seeded ${imported.matched} of ${sample.length} cards in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  const commanders = (
    await seedDb.$client.execute({
      sql: `SELECT DISTINCT c.oracle_id FROM cards c JOIN collection_items i ON i.oracle_id = c.oracle_id
            WHERE c.can_be_commander = 1 AND c.legal_commander = 'legal' ORDER BY c.edhrec_rank LIMIT ?`,
      args: [deckCount],
    })
  ).rows.map((r) => String(r.oracle_id));
  for (const [i, oracleId] of commanders.entries()) {
    // Mostly decks being built, a couple of ideas and one finished deck.
    const status = i % 4 === 3 ? "idea" : i === 0 ? "built" : "building";
    const d = await createDeck(seedDb, { commanderOracleId: oracleId, status: "building" });
    await rebuildDeck(seedDb, d.id);
    if (status !== "building") await setDeckStatus(seedDb, d.id, status);
  }
  await seedDb.$client.execute("PRAGMA wal_checkpoint(TRUNCATE)");
  seedDb.$client.close();
}

const probe = createClient({ url: `file:${file}` });
const big = new Map<string, number>();
for (const t of ["cards", "printings", "collection_items", "deck_cards"]) big.set(t, Number((await probe.execute(`SELECT count(*) AS n FROM ${t}`)).rows[0].n));
const planCache = new Map<string, number>();
/** Rough Turso "rows read": a statement that SCANs (rather than SEARCHes) a big table reads all of it. */
async function rowsScanned(statements: string[]) {
  let rows = 0;
  for (const whole of statements) {
    for (const s of whole.split(" ;; ")) {
      if (!/^\s*(select|with|update|delete|insert)/i.test(s)) continue;
      if (!planCache.has(s)) {
        let n = 0;
        try {
          const plan = await probe.execute({ sql: `EXPLAIN QUERY PLAN ${s}`, args: Array((s.match(/\?/g) ?? []).length).fill(null) });
          for (const r of plan.rows) {
            const m = /^SCAN (\w+)/.exec(String(r.detail));
            const table = m && [...big.keys()].find((t) => t === m[1] || new RegExp(`\\b${t}\\s+(AS\\s+)?"?${m[1]}"?\\b`, "i").test(s));
            if (table) n += big.get(table)!;
          }
        } catch {
          // A statement EXPLAIN can't take with null arguments: count nothing.
        }
        planCache.set(s, n);
      }
      rows += planCache.get(s)!;
    }
  }
  return rows;
}
const deckIds = (await probe.execute("SELECT id, status FROM decks ORDER BY id")).rows.map((r) => ({ id: Number(r.id), status: String(r.status) }));
const ownedCard = String((await probe.execute("SELECT oracle_id FROM collection_items LIMIT 1")).rows[0].oracle_id);
const batch = Number((await probe.execute("SELECT id FROM import_batches ORDER BY id DESC LIMIT 1")).rows[0].id);
const copies = Number((await probe.execute("SELECT sum(quantity) AS n FROM collection_items")).rows[0].n);
console.log(`${copies.toLocaleString()} cards, ${deckIds.length} decks; latency ${latency} ms per database round trip; external calls ${live ? "ON" : "off"}`);

// ---------- 2. The production server, counting round trips ----------
const env = {
  ...process.env,
  DATABASE_URL: `file:${file}`,
  DB_LATENCY_MS: String(latency),
  DB_TRACE: "1",
  EDHREC_ENABLED: String(live),
  SPELLBOOK_ENABLED: String(live),
  APP_PASSWORD: "",
  PORT: String(port),
  NODE_USE_ENV_PROXY: "1",
};
delete (env as Record<string, string | undefined>).VERCEL;
const started = Date.now();
const server = spawn(path.join("node_modules", ".bin", "next"), ["start", "-p", String(port)], { env, stdio: ["ignore", "pipe", "pipe"] });
let trips = 0;
let log = "";
let lines: string[] = [];
server.stdout.on("data", (b: Buffer) => {
  const s = b.toString();
  trips += s.split("[db-trip]").length - 1;
  for (const l of s.split("\n")) if (l.includes("[db-trip]")) lines.push(l.slice(l.indexOf("[db-trip]") + 10));
  log += s;
});
server.stderr.on("data", (b: Buffer) => (log += b.toString()));
const base = `http://127.0.0.1:${port}`;
for (let i = 0; ; i++) {
  try {
    await fetch(`${base}/robots.txt`);
    break;
  } catch {
    if (i > 200) throw new Error(`server didn't start:\n${log}`);
    await new Promise((r) => setTimeout(r, 100));
  }
}
const bootMs = Date.now() - started;

type Kind = "page" | "link";
async function hit(p: string, kind: Kind) {
  const before = trips;
  lines = [];
  const t = Date.now();
  const res = await fetch(base + p, { headers: kind === "link" ? { RSC: "1" } : {}, redirect: "manual" });
  const body = await res.arrayBuffer();
  const ms = Date.now() - t;
  // Let the trailing trace lines arrive.
  await new Promise((r) => setTimeout(r, 30));
  return { ms, trips: trips - before, kb: body.byteLength / 1024, status: res.status, lines: [...lines] };
}

const id = (deckIds.find((d) => d.status === "building") ?? deckIds[0]).id;
const PAGES: [string, string][] = [
  ["Today", "/"],
  ["Collection", "/collection"],
  ["Collection search", "/collection?q=dragon"],
  ["Card page", `/collection/${ownedCard}`],
  ["Decks", "/decks"],
  ["Deck overview", `/decks/${id}`],
  ["Deck cards", `/decks/${id}/cards`],
  ["Deck missing", `/decks/${id}/missing`],
  ["Deck upgrades", `/decks/${id}/suggestions`],
  ["Deck playtest", `/decks/${id}/playtest`],
  ["Shared cards", "/decks/shared"],
  ["Find a commander", "/decks/commanders"],
  ["Commanders by theme", "/decks/commanders?theme=tokens"],
  ["…another theme", "/decks/commanders?theme=lifegain"],
  ["New deck", "/decks/new"],
  ["Add cards", "/collection/add"],
  ["Import review", `/import/${batch}`],
  ["Settings", "/settings"],
];

const first = await hit("/", "page");
console.log(`\nserver up in ${(bootMs / 1000).toFixed(1)}s; first Today ${(first.ms / 1000).toFixed(2)}s, ${first.trips} trips (cold: opens the database, loads caches)\n`);
console.log(`${"page".padEnd(20)} ${"first".padStart(8)} ${"full load".padStart(10)} ${"tap link".padStart(10)} ${"trips".padStart(6)} ${"scanned".padStart(8)} ${"page KB".padStart(8)} ${"link KB".padStart(8)}`);
const rows: { label: string; page: number; link: number; trips: number; scanned: number }[] = [];
for (const [label, p] of PAGES.filter(([l]) => !only.length || only.includes(l))) {
  let best = { page: Infinity, link: Infinity, trips: 0, pkb: 0, lkb: 0, scanned: 0, first: 0 };
  for (let r = 0; r < runs; r++) {
    const a = await hit(p, "page");
    const b = await hit(p, "link");
    if (a.status >= 400) console.log(`  ${label}: HTTP ${a.status}`);
    best = { page: Math.min(best.page, a.ms), link: Math.min(best.link, b.ms), trips: b.trips, pkb: a.kb, lkb: b.kb, scanned: await rowsScanned(b.lines), first: r === 0 ? a.ms : best.first };
    if (showTrace && r === runs - 1) for (const l of b.lines) console.log(`    ${String(await rowsScanned([l])).padStart(7)}  ${l.slice(0, 150)}`);
  }
  rows.push({ label, page: best.page, link: best.link, trips: best.trips, scanned: best.scanned });
  console.log(
    `${label.padEnd(20)} ${`${best.first} ms`.padStart(8)} ${`${best.page} ms`.padStart(10)} ${`${best.link} ms`.padStart(10)} ${String(best.trips).padStart(6)} ${best.scanned.toLocaleString().padStart(8)} ${best.pkb.toFixed(0).padStart(8)} ${best.lkb.toFixed(0).padStart(8)}`,
  );
}
// ---------- 3. Taps that change something, then the page you land on ----------
async function post(p: string, body: unknown) {
  const before = trips;
  lines = [];
  const t = Date.now();
  const res = await fetch(base + p, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  await res.arrayBuffer();
  const ms = Date.now() - t;
  await new Promise((r) => setTimeout(r, 30));
  return { ms, trips: trips - before, scanned: await rowsScanned([...lines]), status: res.status };
}
if (!only.length || only.includes("flows")) {
  const addable = (await probe.execute({ sql: "SELECT oracle_id FROM collection_items WHERE oracle_id NOT IN (SELECT oracle_id FROM deck_cards WHERE deck_id = ?) LIMIT 1", args: [id] })).rows[0];
  const flows: [string, () => Promise<{ ms: number; trips: number; scanned?: number; status: number }>][] = [
    ["Add a card to a deck", () => post(`/api/decks/${id}/cards`, { oracleId: String(addable.oracle_id) })],
    ["…its overview next", () => hit(`/decks/${id}`, "link").then(async (r) => ({ ...r, scanned: await rowsScanned(r.lines) }))],
    ["Rebuild a deck", () => post(`/api/decks/${id}/rebuild`, {})],
    ["…its overview next", () => hit(`/decks/${id}`, "link").then(async (r) => ({ ...r, scanned: await rowsScanned(r.lines) }))],
  ];
  console.log("");
  for (const [label, fn] of flows) {
    const r = await fn();
    if (r.status >= 400) console.log(`  ${label}: HTTP ${r.status}`);
    console.log(`${label.padEnd(20)} ${`${r.ms} ms`.padStart(8)} ${"".padStart(21)} ${String(r.trips).padStart(6)} ${(r.scanned ?? 0).toLocaleString().padStart(8)}`);
  }
}

console.log(`\n("first" = the first visit, when nothing is cached yet; otherwise best of ${runs}; "trips" = database round trips for a tapped link; "scanned" = rows of big tables read in full, which Turso bills;`);
console.log(` add ~120 ms for the trip from Australia to Tokyo, plus a cold start when the app has been idle)`);
probe.close();
if (process.argv.includes("--json")) fs.writeFileSync(arg("json", "bench-pages.json"), JSON.stringify({ latency, live, bootMs, first, rows }, null, 2));
server.kill();
fs.rmSync(dir, { recursive: true, force: true });
