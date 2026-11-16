import type { LoadedDeck } from "@/app/decks/[id]/data";
import { deckEntries } from "./entries";
import { ROLE_LABELS, type Role } from "./roles";
import { deckStats } from "./stats";
import { isBasicLand } from "./text";

/**
 * Two of your decks side by side: the numbers that shape how they play (curve, lands, the roles),
 * the cards they share (one copy can only be in one deck you're playing at a time), and what each
 * plays alone. Basic lands aren't counted as shared or different.
 */

type Deck = Pick<LoadedDeck, "deck" | "commanders" | "cards">;

export type CompareLine = { label: string; a: number; b: number; /** One decimal place, not a count. */ decimal?: boolean };

export type DeckCompare = {
  a: { id: number; name: string; commanders: string[] };
  b: { id: number; name: string; commanders: string[] };
  lines: CompareLine[];
  shared: string[];
  onlyA: string[];
  onlyB: string[];
};

const ROLE_LINES: Role[] = ["ramp", "draw", "removal", "wipe", "tutor", "counter", "protection", "recursion"];

/** Commanders and the 99, by name, front face folded in ("Fable of the Mirror-Breaker"). Basics left out. */
function names(v: Deck): Map<string, string> {
  const out = new Map<string, string>();
  for (const c of [...v.commanders, ...v.cards.filter((c) => c.board === "main")]) {
    if (isBasicLand(c)) continue;
    out.set(c.name.split(" // ")[0].toLowerCase(), c.name);
  }
  return out;
}

export function compareDecks(a: Deck, b: Deck): DeckCompare {
  const sa = deckStats(deckEntries(a), { prices: true });
  const sb = deckStats(deckEntries(b), { prices: true });
  const lines: CompareLine[] = [
    { label: "Cards", a: sa.totalCards, b: sb.totalCards },
    { label: "Average mana value", a: sa.averageManaValue, b: sb.averageManaValue, decimal: true },
    { label: "Lands", a: sa.lands, b: sb.lands },
    { label: "Creatures", a: sa.types.Creature, b: sb.types.Creature },
    ...ROLE_LINES.map((r) => ({ label: ROLE_LABELS[r], a: sa.roles[r] ?? 0, b: sb.roles[r] ?? 0 })).filter((l) => l.a || l.b),
    { label: "Game Changers", a: sa.gameChangers.length, b: sb.gameChangers.length },
  ];
  const na = names(a);
  const nb = names(b);
  const sort = (xs: string[]) => xs.sort((x, y) => x.localeCompare(y));
  return {
    a: { id: a.deck.id, name: a.deck.name, commanders: a.commanders.map((c) => c.name) },
    b: { id: b.deck.id, name: b.deck.name, commanders: b.commanders.map((c) => c.name) },
    lines,
    shared: sort([...na].filter(([k]) => nb.has(k)).map(([, n]) => n)),
    onlyA: sort([...na].filter(([k]) => !nb.has(k)).map(([, n]) => n)),
    onlyB: sort([...nb].filter(([k]) => !na.has(k)).map(([, n]) => n)),
  };
}
