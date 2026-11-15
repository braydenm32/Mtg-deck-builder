import { cache } from "react";
import { notFound } from "next/navigation";
import { eq, inArray } from "drizzle-orm";
import { getDb } from "@/db/client";
import { cards, collectionItems } from "@/db/schema";
import { analyzeDeck } from "@/lib/deck/analyze";
import { findCombos, nearCombos } from "@/lib/deck/combos";
import { getDeck, targetBracketOf } from "@/lib/deck/store";
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
  const { validation, stats, bracket, advice } = analyzeDeck(entries, { targetBracket: targetBracketOf(v.deck.settings) });
  const names = entries.map((e) => e.card.name);
  const near = nearCombos(names);
  const missing = [...new Set(near.map((n) => n.missing))];
  const db = await getDb();
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
    combos: findCombos(names),
    near: near.map((n) => ({ ...n, owned: owned.has(n.missing) })),
  };
}
