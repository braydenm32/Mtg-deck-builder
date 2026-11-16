import { and, eq, inArray, ne } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import type { Db } from "@/db/client";
import { cards, deckCards, printings } from "@/db/schema";
import { tokensOf } from "@/lib/cards/rows";
import { fetchCollection } from "@/lib/scryfall/client";

export type DeckToken = {
  name: string;
  /** Scryfall ID of one printing of the token, for its picture and link. */
  id: string;
  imageSmall: string | null;
  imageNormal: string | null;
  typeLine: string | null;
  /** The deck's cards (and commanders) that make it, in name order. */
  makers: string[];
};

export type DeckTokens = {
  tokens: DeckToken[];
  /** Cards whose token data hasn't been downloaded yet (card data from before tokens were kept). */
  unknown: number;
};

/**
 * The tokens and emblems a deck's commanders and main deck make, from Scryfall's related cards
 * (cards.tokens), with a picture of each so you can find or sleeve them before a game. Tokens with
 * the same name (two kinds of "Soldier") stay separate when Scryfall lists different ones.
 */
export async function deckTokens(db: Db, deckId: number, opts: { fetchMissing?: boolean } = {}): Promise<DeckTokens> {
  const read = () =>
    db
      .select({ oracleId: cards.oracleId, name: cards.name, tokens: cards.tokens })
      .from(deckCards)
      .innerJoin(cards, eq(cards.oracleId, deckCards.oracleId))
      .where(and(eq(deckCards.deckId, deckId), inArray(deckCards.board, ["main", "commander"]), ne(deckCards.quantity, 0)));
  let rows = await read();
  const unchecked = [...new Set(rows.filter((r) => r.tokens == null).map((r) => r.oracleId))];
  if (opts.fetchMissing && unchecked.length && (await fillTokens(db, unchecked))) rows = await read();
  let unknown = 0;
  const byId = new Map<string, { name: string; makers: Set<string> }>();
  for (const r of rows) {
    if (r.tokens == null) {
      unknown++;
      continue;
    }
    for (const t of r.tokens) {
      const e = byId.get(t.id) ?? { name: t.name, makers: new Set<string>() };
      e.makers.add(r.name);
      byId.set(t.id, e);
    }
  }
  const ids = [...byId.keys()];
  const prints = ids.length
    ? await db
        .select({ id: printings.id, imageSmall: printings.imageSmall, imageNormal: printings.imageNormal, oracleId: printings.oracleId })
        .from(printings)
        .where(inArray(printings.id, ids))
    : [];
  const typeRows = prints.length
    ? await db.select({ oracleId: cards.oracleId, typeLine: cards.typeLine }).from(cards).where(inArray(cards.oracleId, [...new Set(prints.map((p) => p.oracleId))]))
    : [];
  const types = new Map(typeRows.map((t) => [t.oracleId, t.typeLine]));
  // The same token reprinted (a Saproling from two sets) shares an oracle ID: show it once.
  const merged = new Map<string, DeckToken>();
  for (const id of ids) {
    const e = byId.get(id)!;
    const p = prints.find((x) => x.id === id);
    const key = p?.oracleId ?? id;
    const seen = merged.get(key);
    if (seen) {
      seen.makers = [...new Set([...seen.makers, ...e.makers])].sort((a, b) => a.localeCompare(b));
      continue;
    }
    merged.set(key, {
      name: e.name,
      id,
      // A printing the card data doesn't have: Scryfall's image link for it still works.
      imageSmall: p?.imageSmall ?? `https://api.scryfall.com/cards/${id}?format=image&version=small`,
      imageNormal: p?.imageNormal ?? `https://api.scryfall.com/cards/${id}?format=image&version=normal`,
      typeLine: p ? (types.get(p.oracleId) ?? null) : null,
      makers: [...e.makers].sort((a, b) => a.localeCompare(b)),
    });
  }
  const tokens = [...merged.values()];
  tokens.sort((a, b) => b.makers.length - a.makers.length || a.name.localeCompare(b.name));
  return { tokens, unknown };
}

/**
 * Card data from before tokens were kept has none for these cards: ask Scryfall for just them (a
 * deck is at most two calls) rather than waiting for the next card data update. False when it
 * can't be reached; the panel then says which cards weren't checked.
 */
async function fillTokens(db: Db, oracleIds: string[]): Promise<boolean> {
  try {
    const { data } = await fetchCollection(oracleIds.map((oracle_id) => ({ oracle_id })));
    const statements: BatchItem<"sqlite">[] = data
      .filter((c) => c.oracle_id)
      .map((c) => db.update(cards).set({ tokens: tokensOf(c) }).where(eq(cards.oracleId, c.oracle_id!)));
    if (!statements.length) return false;
    const [first, ...rest] = statements;
    await db.batch([first, ...rest]);
    return true;
  } catch {
    return false;
  }
}
