/**
 * One call for the deck page: legality, stats, bracket, and a short prioritised list of what to fix,
 * written in plain language. Advice priority: 1 = must fix (illegal, or above the bracket you want),
 * 2 = should fix (missing lands, ramp, colour sources), 3 = worth a look.
 */
import { estimateBracket, BRACKETS, type Bracket, type BracketEstimate } from "./bracket";
import type { Combo } from "./combos";
import { ROLE_LABELS } from "./roles";
import { deckStats, type DeckStats } from "./stats";
import type { DeckEntry } from "./types";
import { validateDeck, type ValidationResult } from "./validate";

export type Advice = {
  priority: 1 | 2 | 3;
  kind: "legality" | "bracket" | "lands" | "roles" | "colors" | "curve";
  message: string;
  cards: string[];
};

export type DeckAnalysis = {
  validation: ValidationResult;
  stats: DeckStats;
  bracket: BracketEstimate;
  advice: Advice[];
};

const COLOR_NAMES = { W: "white", U: "blue", B: "black", R: "red", G: "green" } as const;
const pct = (p: number) => `${Math.round(p * 100)}%`;

export function analyzeDeck(
  entries: readonly DeckEntry[],
  opts: { targetBracket?: Bracket; prices?: boolean; combos?: readonly Combo[] } = {},
): DeckAnalysis {
  const validation = validateDeck(entries);
  const stats = deckStats(entries, { prices: opts.prices });
  const bracket = estimateBracket(entries, { combos: opts.combos });
  const advice: Advice[] = [];

  for (const issue of validation.issues) {
    advice.push({ priority: issue.severity === "error" ? 1 : 3, kind: "legality", message: issue.message, cards: issue.cards });
  }

  if (opts.targetBracket && bracket.bracket > opts.targetBracket) {
    const over = bracket.reasons.filter((r) => r.floor > opts.targetBracket!);
    advice.push({
      priority: 1,
      kind: "bracket",
      message: `This deck plays at Bracket ${bracket.bracket} (${bracket.name}), above your target of ${opts.targetBracket} (${BRACKETS[opts.targetBracket].name}). ${over.map((r) => r.message).join(" ")}`,
      cards: [...new Set(over.flatMap((r) => r.cards))],
    });
  }

  // Only give tuning advice once the deck is roughly full; an empty draft would be all noise.
  const nearlyFull = stats.totalCards >= 90;
  if (nearlyFull) {
    const { delta, recommended, lands } = stats.landAdvice;
    if (delta > 1) {
      // Official precons sit 1-3 lands under the formula, so only a bigger gap is a "should fix".
      advice.push({
        priority: delta >= 3 ? 2 : 3,
        kind: "lands",
        message: `Consider about ${Math.round(delta)} more land${Math.round(delta) === 1 ? "" : "s"}: ${lands} is on the light side for this curve (about ${recommended} is typical).`,
        cards: [],
      });
    } else if (delta < -2) {
      advice.push({ priority: 3, kind: "lands", message: `You could cut about ${Math.round(-delta)} lands for spells: ${lands} is more than this curve needs (about ${recommended} is typical).`, cards: [] });
    }

    for (const line of stats.checklist) {
      if (line.role === "land" || line.status !== "low") continue;
      const need = line.target - line.count;
      advice.push({
        priority: 2,
        kind: "roles",
        message: `${ROLE_LABELS[line.role]}: ${line.count}. Most decks want about ${line.target}; add ${need}.`,
        cards: [],
      });
    }

    for (const c of stats.colors) {
      if (!c.hardest || c.hardest.chanceOnCurve >= 0.6) continue;
      const h = c.hardest;
      advice.push({
        priority: 2,
        kind: "colors",
        message: `More ${COLOR_NAMES[c.color]} sources: ${h.name} needs ${h.pips} ${COLOR_NAMES[c.color]} by turn ${h.manaValue}, and with ${c.landSources} ${COLOR_NAMES[c.color]} land${c.landSources === 1 ? "" : "s"} that happens in ${pct(h.chanceOnCurve)} of games.`,
        cards: [h.name],
      });
    }
    const coloured = stats.colors.filter((c) => c.pips > 0);
    const sourceTotal = coloured.reduce((n, c) => n + c.landSources, 0);
    for (const c of coloured) {
      const share = sourceTotal ? c.landSources / sourceTotal : 0;
      if (coloured.length > 1 && c.pipShare - share > 0.15) {
        advice.push({
          priority: 3,
          kind: "colors",
          message: `${pct(c.pipShare)} of your coloured pips are ${COLOR_NAMES[c.color]}, but only ${pct(share)} of your coloured land sources make it.`,
          cards: [],
        });
      }
    }

    const top = stats.curve.filter((b) => b.manaValue >= 6).reduce((n, b) => n + b.count, 0);
    if (stats.averageManaValue > 4 || top > 12) {
      advice.push({
        priority: 3,
        kind: "curve",
        message: `The curve is top-heavy (average mana value ${stats.averageManaValue}, ${top} cards at 6 or more). Cheaper spells or more ramp will make early turns smoother.`,
        cards: [],
      });
    }
  }

  advice.sort((a, b) => a.priority - b.priority);
  return { validation, stats, bracket, advice };
}
