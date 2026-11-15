/** Dev check: import a file into a scratch copy of the local database and report. npx tsx scripts/try-import.mts file.csv */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { sql } from "drizzle-orm";
import { openDb } from "@/db/client";
import { getBatch, importCollection } from "@/lib/collection/import";

const file = process.argv[2];
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "try-"));
fs.copyFileSync(path.join(process.cwd(), "data", "mtg.db"), path.join(dir, "t.db"));
const db = await openDb(`file:${path.join(dir, "t.db")}`);
await db.run(sql`DELETE FROM collection_items`);
const s = await importCollection(db, { text: fs.readFileSync(file, "utf8"), filename: path.basename(file) });
console.log(s);
const b = await getBatch(db, s.batchId);
for (const m of b?.misses ?? []) console.log("MISS", m.rowNumber, m.name, m.setCode, m.collectorNumber, m.reason);
console.log(await db.all(sql`SELECT finish, location, printing_confidence, SUM(quantity) q FROM collection_items GROUP BY 1,2,3`));
db.$client.close();
fs.rmSync(dir, { recursive: true, force: true });
