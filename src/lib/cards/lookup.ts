import { and, desc, eq, like, notInArray, notLike, or, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { cards, printings } from "@/db/schema";
import { frontFace, normCollectorNumber, normName, normSetCode } from "./normalize";
import { NON_DECK_LAYOUTS } from "./rows";

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

/** The oracle card(s) with exactly this name (front-face names work too). */
export async function cardsByName(db: Db, name: string): Promise<Card[]> {
  const n = normName(name);
  const front = normName(frontFace(name));
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
  const cols = { oracleId: cards.oracleId, name: cards.name, typeLine: cards.typeLine, imageSmall: cards.imageSmall, colorIdentity: cards.colorIdentity };
  const filters = [
    // In deck contexts, only cards you can put in a deck.
    opts.commander || opts.identity !== undefined ? notInArray(cards.layout, NON_DECK_LAYOUTS) : undefined,
    opts.commander ? and(eq(cards.canBeCommander, true), eq(cards.legalCommander, "legal")) : undefined,
    ...(opts.identity !== undefined ? "WUBRG".split("").filter((c) => !opts.identity!.includes(c)).map((c) => notLike(cards.colorIdentity, `%${c}%`)) : []),
  ];
  const prefix = await db
    .select(cols)
    .from(cards)
    .where(and(like(cards.normName, `${q}%`), ...filters))
    .orderBy(sql`${cards.edhrecRank} IS NULL`, cards.edhrecRank)
    .limit(limit);
  if (prefix.length >= limit) return prefix;
  const seen = new Set(prefix.map((c) => c.oracleId));
  const contains = await db
    .select(cols)
    .from(cards)
    .where(and(like(cards.normName, `%${q}%`), ...filters))
    .orderBy(sql`${cards.edhrecRank} IS NULL`, cards.edhrecRank)
    .limit(limit * 2);
  return prefix.concat(contains.filter((c) => !seen.has(c.oracleId))).slice(0, limit);
}

/** Every card name with its id, for building an in-memory fuzzy index (e.g. for the scanner's OCR). */
export async function allCardNames(db: Db): Promise<{ oracleId: string; name: string }[]> {
  return db.select({ oracleId: cards.oracleId, name: cards.name }).from(cards);
}
