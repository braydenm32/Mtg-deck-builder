/**
 * Dev benchmark: how the main flows behave against a hosted database (Turso), where every query is a
 * network round trip and Turso bills "rows read". Runs on a scratch copy of data/mtg.db, adds a fake
 * delay to every round trip, and reports round trips, time and the full-table scans per flow.
 *   npx tsx scripts/bench-remote.mts [latencyMs=4] [importRows=2000]
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { sql } from "drizzle-orm";
import * as schema from "@/db/schema";
import { openDb, type Db } from "@/db/client";
import { importCollection } from "@/lib/collection/import";
import { queryCollection, collectionTotals } from "@/lib/collection/query";
import { dashboardStats } from "@/lib/collection/stats";
import { createDeck, rebuildDeck, getDeck, listDecks } from "@/lib/deck/store";
import { sharedCards } from "@/lib/deck/allocate";
import { searchCardNames, allCardNames } from "@/lib/cards/lookup";

process.env.EDHREC_ENABLED = "false";
process.env.SPELLBOOK_ENABLED = "false";

const latency = Number(process.argv[2] ?? 4);
const importRows = Number(process.argv[3] ?? 2000);
const src = path.join(process.cwd(), "data", "mtg.db");
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bench-remote-"));
fs.copyFileSync(src, path.join(dir, "bench.db"));
// Bring the copy's schema up to date (and count the catalogue) first, as a running app would have.
const setup = await openDb(`file:${path.join(dir, "bench.db")}`);
await dashboardStats(setup);
setup.$client.close();
const raw = createClient({ url: `file:${path.join(dir, "bench.db")}` });

let trips = 0;
const statements: string[] = [];
const wait = () => (latency ? new Promise((r) => setTimeout(r, latency)) : Promise.resolve());
const text = (s: unknown) => (typeof s === "string" ? s : (s as { sql: string }).sql);

function wrap<T extends object>(target: T): T {
  return new Proxy(target, {
    get(t, prop, recv) {
      const v = Reflect.get(t, prop, recv);
      if (typeof v !== "function") return v;
      if (prop === "execute") return async (s: unknown, a?: unknown) => (trips++, statements.push(text(s)), await wait(), v.call(t, s, a));
      if (prop === "batch") return async (s: unknown[], m?: unknown) => (trips++, s.forEach((x) => statements.push(text(x))), await wait(), v.call(t, s, m));
      if (prop === "transaction") return async (m?: unknown) => (trips++, await wait(), wrap(await v.call(t, m)));
      if (prop === "commit" || prop === "rollback") return async () => (trips++, await wait(), v.call(t));
      return v.bind(t);
    },
  });
}

const client = wrap(raw) as Client;
const db = drizzle(client, { schema }) as unknown as Db;
await db.run(sql`DELETE FROM deck_cards`);
await db.run(sql`DELETE FROM decks`);
await db.run(sql`DELETE FROM collection_items`);

const big = new Map<string, number>();
for (const t of ["cards", "printings", "collection_items"]) {
  const r = await raw.execute(`SELECT count(*) AS n FROM ${t}`);
  big.set(t, Number(r.rows[0].n));
}

async function scans(list: string[]) {
  // Rough "rows read": each statement that SCANs (not SEARCHes) a big table reads all its rows.
  let rows = 0;
  const seen = new Map<string, number>();
  for (const s of list) seen.set(s, (seen.get(s) ?? 0) + 1);
  for (const [s, n] of seen) {
    if (!/^\s*(select|with|update|delete|insert)/i.test(s)) continue;
    let plan;
    try {
      plan = await raw.execute({ sql: `EXPLAIN QUERY PLAN ${s}`, args: Array(((s.match(/\?/g) ?? []).length)).fill(null) });
    } catch {
      continue;
    }
    for (const r of plan.rows) {
      const m = /^SCAN (\w+)/.exec(String(r.detail));
      if (m && big.has(m[1])) rows += big.get(m[1])! * n;
    }
  }
  return rows;
}

async function flow(label: string, fn: () => Promise<unknown>) {
  trips = 0;
  statements.length = 0;
  const t0 = Date.now();
  await fn();
  const ms = Date.now() - t0;
  console.log(`${label.padEnd(34)} ${String(trips).padStart(6)} trips  ${(ms / 1000).toFixed(1).padStart(6)}s  ~${(await scans(statements)).toLocaleString()} rows scanned`);
}

console.log(`latency ${latency} ms per round trip; cards ${big.get("cards")}, printings ${big.get("printings")}`);
const sample = (await raw.execute({ sql: "SELECT name, set_code, collector_number FROM printings WHERE lang='en' ORDER BY random() LIMIT ?", args: [importRows] })).rows;
const csv = [
  '"Count","Tradelist Count","Name","Edition","Condition","Language","Foil","Collector Number"',
  ...sample.map((r) => `"1","0","${String(r.name).replace(/"/g, '""')}","${r.set_code}","Near Mint","English","","${r.collector_number}"`),
].join("\n");

await flow(`import ${importRows} rows`, () => importCollection(db, { text: csv, online: false }));
await flow("collection page (default)", async () => {
  await queryCollection(db, {});
  await collectionTotals(db, {});
});
await flow("collection search 'dragon'", () => queryCollection(db, { q: "dragon" }));
await flow("today stats", () => dashboardStats(db));
await flow("name autocomplete 'sol r'", () => searchCardNames(db, "sol r"));
await flow("scanner name index", () => allCardNames(db));
const cmdRows = await raw.execute("SELECT c.oracle_id FROM cards c JOIN printings p ON p.oracle_id=c.oracle_id JOIN collection_items i ON i.printing_id=p.id WHERE c.legal_commander='legal' AND c.can_be_commander=1 GROUP BY c.oracle_id ORDER BY count(*) DESC LIMIT 1");
const cmd = cmdRows.rows[0] as unknown as { oracle_id: string } | undefined;
let deckId = 0;
if (cmd) {
  await flow("create + build deck", async () => {
    const d = await createDeck(db, { commanderOracleId: cmd.oracle_id, status: "building" });
    deckId = d.id;
    await rebuildDeck(db, d.id);
  });
  await flow("deck page", () => getDeck(db, deckId));
  await flow("deck list", () => listDecks(db));
  await flow("shared cards", () => sharedCards(db));
}
const photos = process.env.SCAN_DIR;
if (photos && fs.existsSync(photos)) {
  const { extractCard, identifyCard } = await import("@/scanner/identify");
  const { decodeImage, getRecognizerDeps } = await import("@/scanner/server");
  const sharp = (await import("sharp")).default;
  const deps = await getRecognizerDeps(db);
  const files = fs.readdirSync(photos).filter((f) => f.endsWith(".jpg")).slice(0, 8);
  await flow(`scan ${files.length} real photos`, async () => {
    for (const f of files) {
      const buf = await sharp(fs.readFileSync(path.join(photos, f))).rotate().resize({ height: 3000, width: 3000, fit: "inside" }).jpeg({ quality: 92 }).toBuffer();
      await identifyCard(extractCard(await decodeImage(buf)).card, deps);
    }
  });
  (await deps.ocr).terminate();
}
raw.close();
fs.rmSync(dir, { recursive: true, force: true });
