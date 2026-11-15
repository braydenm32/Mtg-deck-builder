import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { openDb, type Db } from "@/db/client";
import { syncCards } from "@/lib/cards/sync";

export const FIXTURE = path.join(__dirname, "fixtures", "scryfall-cards.json");
export const FIXTURE_JA = path.join(__dirname, "fixtures", "scryfall-ja.json");

/** A fresh file-backed database (libsql's :memory: loses data across transactions). */
export async function tempDb(): Promise<{ db: Db; cleanup: () => void }> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mtg-test-"));
  const db = await openDb(`file:${path.join(dir, "test.db")}`);
  return {
    db,
    cleanup: () => {
      db.$client.close();
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}

/** A database loaded with the fixture cards (used as both oracle and default bulk files). */
export async function seededDb() {
  const t = await tempDb();
  await syncCards(t.db, { files: { oracle_cards: FIXTURE, default_cards: FIXTURE } });
  return t;
}
