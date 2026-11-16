import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { cards, printings } from "@/db/schema";
import { frontFace, normCollectorNumber, normName, normSetCode } from "./normalize";
import { NON_DECK_LAYOUTS } from "./rows";
import { cardNameRows, type NameRow } from "./name-cache";

export type Card = typeof cards.$inferSelect;
export type Printing = typeof printings.$inferSelect;

/** One printing by Scryfall ID. */
export async function printingById(db: Db, scryfallId: string): Promise<Printing | undefined> {
  const [p] = await db.select().from(printings).where(eq(printings.id, scryfallId.trim().toLowerCase()));
  return p;
}

/** Printings with this set code and collector number (several when a set has many languages). */
export async function printingsBySetNumber(db: Db, setCode: string, collectorNumber: string): Promise<Printing[]> {
  const set = normSetCode(setCode);
  const num = normCollectorNumber(collectorNumber);
  if (!set || !num) return [];
  return db
    .select()
    .from(printings)
    .where(and(eq(printings.setCode, set), eq(printings.collectorNumber, num)));
}

/**
 * Printings numbered `collectorNumber` in sets whose numbering runs to about
 * `setTotal`. Cards from before 2015 print only "74/175" (no set code), so this
 * is how a scanned number finds its set. A set's highest plain number can
 * exceed its printed total (bonus cards), so a little headroom is allowed.
 */
export async function printingsByNumberAndTotal(db: Db, collectorNumber: string, setTotal: number): Promise<Printing[]> {
  const num = normCollectorNumber(collectorNumber);
  if (!num || !(setTotal > 0)) return [];
  const rows = await db.select().from(printings).where(eq(printings.collectorNumber, num));
  if (!rows.length) return [];
  const sets = [...new Set(rows.map((r) => r.setCode))];
  const nums = await db
    .select({ setCode: printings.setCode, n: sql<number>`MAX(CAST(${printings.collectorNumber} AS INTEGER))` })
    .from(printings)
    .where(and(inArray(printings.setCode, sets), sql`${printings.collectorNumber} NOT GLOB '*[^0-9]*'`))
    .groupBy(printings.setCode);
  const maxBySet = new Map(nums.map((r) => [r.setCode, Number(r.n)]));
  const slack = Math.max(12, Math.round(setTotal * 0.12));
  return rows.filter((r) => {
    const max = maxBySet.get(r.setCode) ?? 0;
    return max >= setTotal && max <= setTotal + slack;
  });
}

/** The oracle card(s) with exactly this name (front-face names work too). */
export async function cardsByName(db: Db, name: string): Promise<Card[]> {
  const n = normName(name);
  const front = normName(frontFace(name));
  // A line of punctuation ("???") normalises to nothing, which would match the card named "_____".
  if (!n && !name.includes("_")) return [];
  // Real cards before tokens, art cards and the like that share the name.
  return db
    .select()
    .from(cards)
    .where(or(eq(cards.normName, n), eq(cards.normFrontName, n), eq(cards.normFrontName, front)))
    .orderBy(sql`${cards.layout} IN ${NON_DECK_LAYOUTS}`);
}

/** All known printings of a card name: regular printings first (fewest promo/special treatments), then newest. */
export async function printingsByName(db: Db, name: string): Promise<Printing[]> {
  const found = await cardsByName(db, name);
  if (!found.length) return [];
  return db
    .select()
    .from(printings)
    .where(or(...found.map((c) => eq(printings.oracleId, c.oracleId))))
    .orderBy(printings.variantRank, desc(printings.releasedAt));
}

/** Name autocomplete: names starting with the query first, then names containing it. */
export type SearchOptions = {
  /** Only cards that can be your commander. */
  commander?: boolean;
  /** Only cards within this colour identity (WUBRG letters), e.g. for adding to a deck. */
  identity?: string;
};

export async function searchCardNames(
  db: Db,
  query: string,
  limit = 20,
  opts: SearchOptions = {},
): Promise<Pick<Card, "oracleId" | "name" | "typeLine" | "imageSmall" | "colorIdentity">[]> {
  const q = normName(query);
  if (!q) return [];
  const deckOnly = opts.commander || opts.identity !== undefined;
  const outside = opts.identity !== undefined ? "WUBRG".split("").filter((c) => !opts.identity!.includes(c)) : [];
  const fits = (c: NameRow) =>
    // In deck contexts, only cards you can put in a deck.
    (!deckOnly || !NON_DECK_LAYOUTS.includes(c.layout)) &&
    (!opts.commander || (c.canBeCommander && c.legalCommander === "legal")) &&
    outside.every((x) => !c.colorIdentity.includes(x));
  // Rows come most popular first, so the first `limit` hits are the best ones.
  const prefix: NameRow[] = [];
  const contains: NameRow[] = [];
  for (const c of await cardNameRows(db)) {
    if (prefix.length >= limit) break;
    const at = c.normName.indexOf(q);
    if (at < 0 || !fits(c)) continue;
    if (at === 0) prefix.push(c);
    else if (contains.length < limit) contains.push(c);
  }
  const pick = ({ oracleId, name, typeLine, imageSmall, colorIdentity }: NameRow) => ({ oracleId, name, typeLine, imageSmall, colorIdentity });
  return prefix.concat(contains).slice(0, limit).map(pick);
}

/** Every card name with its id, for building an in-memory fuzzy index (e.g. for the scanner's OCR). */
export async function allCardNames(db: Db): Promise<{ oracleId: string; name: string }[]> {
  return db.select({ oracleId: cards.oracleId, name: cards.name }).from(cards);
}
