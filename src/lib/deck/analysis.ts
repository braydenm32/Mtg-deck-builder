import type { LoadedDeck } from "@/app/decks/[id]/data";
import { analyzeDeck } from "./analyze";
import { findCombos, KNOWN_TWO_CARD_COMBOS, nearCombos, type Combo } from "./combos";
import { deckEntries } from "./entries";
import { targetBracketOf } from "./status";

/**
 * The deck overview's analysis, from the deck and what it needs from outside it (combos, and which
 * near-combos you could finish). Pure: the server calls it with fresh inputs (analyze() in
 * src/app/decks/[id]/data.ts), the device with the inputs it kept and the deck as its unsent edits
 * leave it.
 */

export type NearCombo = { combo: Combo; missing: string; owned: boolean };

export type AnalysisInputs = {
  source: "spellbook" | "builtin";
  combos: Combo[];
  near: NearCombo[];
  /** Spellbook's combos for the deck, complete or one card away (see DeckCombos.pool). */
  pool?: Combo[];
};

export function finishAnalysis(v: Pick<LoadedDeck, "deck" | "commanders" | "cards">, inputs: AnalysisInputs) {
  const { validation, stats, bracket, advice } = analyzeDeck(deckEntries(v), { targetBracket: targetBracketOf(v.deck.settings), combos: inputs.combos });
  return {
    advice: [...advice].sort((a, b) => a.priority - b.priority),
    validation,
    stats,
    bracket,
    comboSource: inputs.source,
    // Bracket-annotated (early, two-card, floor) where the bracket counted the combo.
    // Match by Spellbook id: two different combos can use the same cards.
    combos: inputs.combos.map((c) => bracket.combos.find((b) => (b.id ?? b.cards.join()) === (c.id ?? c.cards.join())) ?? c),
    // One card away: the ones you could finish from your collection first, then the most popular.
    near: [...inputs.near].sort((a, b) => Number(b.owned) - Number(a.owned)),
  };
}

export type DeckAnalysis = ReturnType<typeof finishAnalysis>;

/**
 * Combos found again for a deck that changed on the device: complete ones and ones a card away, from
 * the combos Spellbook gave for the deck as it was (or the built-in list). `ownedNames` says which
 * missing cards you own.
 */
export function inputsFor(v: Pick<LoadedDeck, "commanders" | "cards">, kept: AnalysisInputs, ownedNames: ReadonlySet<string>, limit = 30): AnalysisInputs {
  const names = [...v.commanders.map((c) => c.name), ...v.cards.filter((c) => c.board === "main").map((c) => c.name)];
  const pool = kept.source === "spellbook" ? (kept.pool ?? [...kept.combos, ...kept.near.map((n) => n.combo)]) : KNOWN_TWO_CARD_COMBOS;
  const near = nearCombos(names, pool)
    .sort((a, b) => (b.combo.popularity ?? 0) - (a.combo.popularity ?? 0))
    .slice(0, limit)
    .map((n) => ({ ...n, owned: ownedNames.has(n.missing) }));
  return { source: kept.source, combos: findCombos(names, pool), near, pool: kept.pool };
}
