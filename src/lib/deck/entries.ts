import type { DeckRow, LoadedDeck } from "@/app/decks/[id]/data";
import type { DeckCardInput, DeckEntry } from "./types";

/**
 * A loaded deck as DeckEntry[] for the analysis modules: commanders, the 99 and (optionally) the
 * maybeboard. No database code, so the device can analyse a deck too.
 */
export function deckEntries(v: Pick<LoadedDeck, "commanders" | "cards">, opts: { maybe?: boolean } = {}): DeckEntry<DeckCardInput & { row?: DeckRow }>[] {
  return [
    ...v.commanders.map((c) => ({ card: c, quantity: 1, board: "commander" as const })),
    ...v.cards
      .filter((c) => c.board === "main" || (opts.maybe && c.board === "maybe"))
      .map((c) => ({ card: { ...c, row: c }, quantity: c.quantity, board: c.board as "main" | "maybe" })),
  ];
}
