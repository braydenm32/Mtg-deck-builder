import { and, eq, inArray } from "drizzle-orm";
import type { Db } from "@/db/client";
import { deckCards, decks, wants } from "@/db/schema";
import { addWant, removeWant } from "@/lib/collection/wants";
import { addDeckCard, placeCopies } from "@/lib/deck/store";

/**
 * Where a scanned card goes besides (or instead of) the collection:
 * - a deck: the card joins your collection as usual and is added to the deck (locked, like any card
 *   you add by hand), so scanning a deck in from the table builds its list as you go;
 * - the want list: the card isn't yours, so it goes on the want list (a friend's binder, a shop's
 *   case) and not into the collection.
 * Each add says how to take it back, for the scanner's Undo and Fix.
 */

/** Add the scanned card to a deck. `cardId` is the row this made, null when the deck already had it. */
export async function scanIntoDeck(db: Db, deckId: number, oracleId: string): Promise<{ cardId: number | null; deck: string } | undefined> {
  const [deck] = await db.select({ name: decks.name }).from(decks).where(eq(decks.id, deckId));
  if (!deck) return undefined;
  const [had] = await db
    .select({ id: deckCards.id })
    .from(deckCards)
    .where(and(eq(deckCards.deckId, deckId), eq(deckCards.oracleId, oracleId), inArray(deckCards.board, ["main", "commander", "maybe", "wanted", "upgrade"])));
  if (had) {
    // Already listed (perhaps on Maybe): the scan is your copy of it, so it's placed in the main deck.
    const [row] = await db.select({ board: deckCards.board }).from(deckCards).where(eq(deckCards.id, had.id));
    if (row?.board !== "main" && row?.board !== "commander") await addDeckCard(db, deckId, oracleId);
    else await placeCopies(db, deckId);
    return { cardId: null, deck: deck.name };
  }
  await addDeckCard(db, deckId, oracleId);
  const [row] = await db.select({ id: deckCards.id }).from(deckCards).where(and(eq(deckCards.deckId, deckId), eq(deckCards.oracleId, oracleId), eq(deckCards.board, "main")));
  return { cardId: row?.id ?? null, deck: deck.name };
}

/** Take back a scan's deck add: the row it made comes out. */
export async function undoScanIntoDeck(db: Db, deckId: number, cardId: number) {
  await db.delete(deckCards).where(and(eq(deckCards.id, cardId), eq(deckCards.deckId, deckId), eq(deckCards.board, "main")));
  await placeCopies(db, deckId);
}

/** Put one copy on the want list. `previous` is how many it wanted before, for Undo. */
export async function scanIntoWants(db: Db, oracleId: string): Promise<{ previous: number; quantity: number }> {
  const [cur] = await db.select({ quantity: wants.quantity }).from(wants).where(eq(wants.oracleId, oracleId));
  const quantity = await addWant(db, oracleId, 1);
  return { previous: cur?.quantity ?? 0, quantity };
}

export async function undoScanIntoWants(db: Db, oracleId: string, previous: number) {
  if (previous <= 0) await removeWant(db, oracleId);
  else await db.update(wants).set({ quantity: Math.min(99, previous) }).where(eq(wants.oracleId, oracleId));
}
