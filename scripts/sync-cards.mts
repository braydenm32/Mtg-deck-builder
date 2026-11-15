/**
 * Download Scryfall bulk data into the local database.
 *   npm run sync:cards                 # download if older than 24h
 *   npm run sync:cards -- --force      # always download
 *   npm run sync:cards -- --oracle path/oracle.json --default path/default.json
 */
import { openDb } from "@/db/client";
import { syncCards } from "@/lib/cards/sync";

const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(name);
  return i === -1 ? undefined : args[i + 1];
};

const started = Date.now();
const db = await openDb();
const result = await syncCards(db, {
  maxAgeHours: args.includes("--force") ? undefined : 24,
  files: { oracle_cards: flag("--oracle"), default_cards: flag("--default") },
  progress: (m) => console.log(m),
});
console.log(result, `in ${((Date.now() - started) / 1000).toFixed(0)}s`);
db.$client.close();
