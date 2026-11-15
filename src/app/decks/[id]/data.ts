import { cache } from "react";
import { notFound } from "next/navigation";
import { eq, inArray } from "drizzle-orm";
import { getDb } from "@/db/client";
import { cards, collectionItems } from "@/db/schema";
import { analyzeDeck } from "@/lib/deck/analyze";
import { getDeck, targetBracketOf } from "@/lib/deck/store";
import { deckCombos } from "@/lib/spellbook/client";
import type { DeckCardInput, DeckEntry } from "@/lib/deck/types";

/** One getDeck per request, shared by the layout and the tab. */
export const loadDeck = cache(async (idParam: string) => {
  const id = Number.parseInt(idParam, 10);
  const v = Number.isFinite(id) ? await getDeck(await getDb(), id) : undefined;
  if (!v) notFound();
  return v;
});

export type LoadedDeck = Awaited<ReturnType<typeof loadDeck>>;
export type DeckRow = LoadedDeck["cards"][number];

/** The deck as DeckEntry[] for the analysis modules: commanders, the 99 and the maybeboard. */
export function deckEntries(v: LoadedDeck, opts: { maybe?: boolean } = {}): DeckEntry<DeckCardInput & { row?: DeckRow }>[] {
  return [
    ...v.commanders.map((c) => ({ card: c, quantity: 1, board: "commander" as const })),
    ...v.cards
      .filter((c) => c.board === "main" || (opts.maybe && c.board === "maybe"))
      .map((c) => ({ card: { ...c, row: c }, quantity: c.quantity, board: c.board as "main" | "maybe" })),
  ];
}

/** Legality, stats, bracket and combos for the overview. */
export async function analyze(v: LoadedDeck) {
  const entries = deckEntries(v);
  const db = await getDb();
  // Commander Spellbook (cached a week), or the built-in list when it can't be reached.
  const found = await deckCombos(db, entries);
  const { validation, stats, bracket, advice } = analyzeDeck(entries, { targetBracket: targetBracketOf(v.deck.settings), combos: found.combos });
  const missing = [...new Set(found.near.map((n) => n.missing))];
  const ownedRows = missing.length
    ? await db
        .selectDistinct({ name: cards.name })
        .from(cards)
        .innerJoin(collectionItems, eq(collectionItems.oracleId, cards.oracleId))
        .where(inArray(cards.name, missing))
    : [];
  const owned = new Set(ownedRows.map((r) => r.name));
  return {
    advice: [...advice].sort((a, b) => a.priority - b.priority),
    validation,
    stats,
    bracket,
    comboSource: found.source,
    // Bracket-annotated (early, two-card, floor) where the bracket counted the combo.
    // Match by Spellbook id: two different combos can use the same cards.
    combos: found.combos.map((c) => bracket.combos.find((b) => (b.id ?? b.cards.join()) === (c.id ?? c.cards.join())) ?? c),
    // One card away: the ones you could finish from your collection first, then the most popular.
    near: found.near.map((n) => ({ ...n, owned: owned.has(n.missing) })).sort((a, b) => Number(b.owned) - Number(a.owned)),
  };
}
