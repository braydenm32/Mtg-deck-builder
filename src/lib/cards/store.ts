import { sql, getTableColumns, type SQL } from "drizzle-orm";
import type { SQLiteTable } from "drizzle-orm/sqlite-core";
import type { Db } from "@/db/client";
import { cards, printings } from "@/db/schema";
import type { ScryfallCard } from "@/lib/scryfall/client";
import { toCardRow, toPrintingRow, type CardRow, type PrintingRow } from "./rows";

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type Writer = Db | Tx;

/** `SET col = excluded.col` for every column except the key, for upserts. */
function excludedSet(table: SQLiteTable, skip: string[]): Record<string, SQL> {
  const set: Record<string, SQL> = {};
  for (const [key, col] of Object.entries(getTableColumns(table))) {
    if (skip.includes(key)) continue;
    set[key] = sql.raw(`excluded.\`${col.name}\``);
  }
  return set;
}

const CARD_SET = excludedSet(cards, ["oracleId"]);
const PRINTING_SET = excludedSet(printings, ["id"]);

// SQLite caps bound parameters per statement (32766 in modern builds); stay well under.
const CHUNK = 200;

export async function upsertCards(db: Writer, rows: CardRow[]) {
  for (let i = 0; i < rows.length; i += CHUNK) {
    await db
      .insert(cards)
      .values(rows.slice(i, i + CHUNK))
      .onConflictDoUpdate({ target: cards.oracleId, set: CARD_SET });
  }
}

export async function upsertPrintings(db: Writer, rows: PrintingRow[]) {
  for (let i = 0; i < rows.length; i += CHUNK) {
    await db
      .insert(printings)
      .values(rows.slice(i, i + CHUNK))
      .onConflictDoUpdate({ target: printings.id, set: PRINTING_SET });
  }
}

/**
 * Store cards fetched live from the API (e.g. a non-English printing that isn't in the
 * Default Cards bulk file). Adds the printing, and the oracle card only if we don't have it:
 * Scryfall keeps English oracle text on every printing, so this never clobbers good data.
 */
export async function storeScryfallCards(db: Writer, list: ScryfallCard[]) {
  const now = new Date().toISOString();
  await upsertPrintings(
    db,
    list.map((c) => toPrintingRow(c, now)).filter((r): r is PrintingRow => !!r),
  );
  const cardRows = list.map((c) => toCardRow(c, now)).filter((r): r is CardRow => !!r);
  for (let i = 0; i < cardRows.length; i += CHUNK) {
    await db.insert(cards).values(cardRows.slice(i, i + CHUNK)).onConflictDoNothing();
  }
}
