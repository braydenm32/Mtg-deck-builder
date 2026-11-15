/**
 * Dev benchmark: build an N-row Moxfield-style CSV from random printings and import it into a
 * scratch database copy. npx tsx scripts/bench-import.mts 10000
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { sql } from "drizzle-orm";
import { openDb } from "@/db/client";
import { importCollection } from "@/lib/collection/import";

const n = Number(process.argv[2] ?? 10000);
const src = path.join(process.cwd(), "data", "mtg.db");
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bench-"));
fs.copyFileSync(src, path.join(dir, "bench.db"));
const db = await openDb(`file:${path.join(dir, "bench.db")}`);
await db.run(sql`DELETE FROM collection_items`);

const rows = await db.all<{ name: string; set_code: string; collector_number: string }>(
  sql`SELECT name, set_code, collector_number FROM printings WHERE lang = 'en' ORDER BY random() LIMIT ${n}`,
);
const csv = [
  '"Count","Tradelist Count","Name","Edition","Condition","Language","Foil","Collector Number"',
  ...rows.map((r) => `"1","0","${r.name.replace(/"/g, '""')}","${r.set_code}","Near Mint","English","","${r.collector_number}"`),
].join("\n");

const t0 = Date.now();
const s = await importCollection(db, { text: csv, online: false });
console.log(`${n} rows: matched ${s.matched}, unmatched ${s.unmatched} in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
db.$client.close();
fs.rmSync(dir, { recursive: true, force: true });
