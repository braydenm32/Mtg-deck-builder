/**
 * Commander Brackets estimate, from the deck's cards.
 *
 * Rules as of the February 9, 2026 update (https://magic.wizards.com/en/news/announcements/commander-brackets-beta-update-february-9-2026):
 *
 * | Bracket          | Game Changers | Mass land denial | Extra turns                 | Two-card infinite combos       |
 * |------------------|---------------|------------------|-----------------------------|--------------------------------|
 * | 1 Exhibition     | 0             | no               | none                        | none                           |
 * | 2 Core           | 0             | no               | a few, never chained        | none                           |
 * | 3 Upgraded       | up to 3       | no               | a few, never chained        | only late-game (turn 6+)       |
 * | 4 Optimized      | any           | yes              | yes                         | yes                            |
 * | 5 cEDH           | any           | yes              | yes                         | yes                            |
 *
 * Tutors stopped being restricted on October 21, 2025. The Game Changers list comes from Scryfall's
 * `game_changer` flag, so it stays current with each card sync.
 *
 * What a card list can't tell: Bracket 1 vs 2 is about theme and intent, and 4 vs 5 is about intent and
 * the metagame. Wizards says intent matters most. So this returns the lowest bracket the cards allow
 * (a floor) with the reasons, and the deck's owner picks the final number.
 *
 * Thresholds that are this app's own judgement, because the rules give no number:
 * - "A few" extra-turn cards = 1 or 2. Three or more counts as likely to chain (Bracket 4).
 * - A combo is "early" when both pieces can be cast by turn 5 without ramp (see `comboTurn`).
 *
 * Combos come from Commander Spellbook when the caller passes them (`opts.combos`, see
 * src/lib/spellbook/), else from the built-in list. The bracket rules only restrict two-card combos, so
 * combos of three or more cards, or that need a non-card piece, are listed but don't raise the floor.
 */
import { KNOWN_TWO_CARD_COMBOS, findCombos, isTwoCardCombo, type Combo } from "./combos";
import { frontType, isLand, rulesText } from "./text";
import type { DeckCardInput, DeckEntry } from "./types";

export type Bracket = 1 | 2 | 3 | 4 | 5;

export const BRACKETS: Record<Bracket, { name: string; summary: string; turns: string }> = {
  1: { name: "Exhibition", summary: "Theme and fun over raw power.", turns: "Games go at least 9 turns." },
  2: { name: "Core", summary: "The classic casual Commander experience.", turns: "Games go at least 8 turns." },
  3: { name: "Upgraded", summary: "Tuned decks, beefed up beyond precon level.", turns: "Games go at least 6 turns." },
  4: { name: "Optimized", summary: "The strongest deck you can build, no holds barred.", turns: "Games can end by turn 4." },
  5: { name: "cEDH", summary: "Competitive Commander, where winning is the point.", turns: "Games can end on any turn." },
};

/** Game Changers allowed per bracket. */
export const GAME_CHANGER_LIMIT: Record<Bracket, number> = { 1: 0, 2: 0, 3: 3, 4: Infinity, 5: Infinity };

export type BracketReason = {
  /** The lowest bracket this finding allows. */
  floor: Bracket;
  code: "game-changers" | "mass-land-denial" | "extra-turns" | "extra-turns-chain" | "combo-early" | "combo-late";
  message: string;
  cards: string[];
};

export type FoundCombo = Combo & {
  earliestTurn: number;
  early: boolean;
  /** Counts as a two-card combo under the bracket rules (see `isTwoCardCombo`). */
  twoCard: boolean;
  /** The lowest bracket this combo allows: 4 (early), 3 (late, or Spellbook rates it 3), 2 (no limit). */
  floor: 2 | 3 | 4;
};

/** Commander Spellbook's tags mapped to brackets, as its own estimator does (R 4; S, P 3; O, C 2; E 1). */
const TAG_BRACKET: Record<string, number> = { R: 4, S: 3, P: 3, O: 2, C: 2, E: 1, B: 4 };

/**
 * How far a combo pushes the bracket. Our own timing says early (4) or late (3); a Spellbook tag can
 * only lower that, since its editors rate each combo by hand (Biovisionary + Rite of Replication is a
 * two-card win, but slow and clunky enough that Spellbook calls it Core).
 */
function comboFloor(c: Combo, twoCard: boolean, early: boolean): 2 | 3 | 4 {
  if (!twoCard) return 2;
  const ours = early ? 4 : 3;
  const tag = c.bracketTag ? TAG_BRACKET[c.bracketTag] : undefined;
  return Math.max(2, Math.min(ours, tag ?? 4)) as 2 | 3 | 4;
}

export type BracketEstimate = {
  /** The lowest bracket the deck's cards fit. 2 when nothing pushes it up. */
  bracket: Bracket;
  name: string;
  /** True when nothing rules out Bracket 1; whether it *is* Exhibition depends on the deck's intent. */
  couldBeExhibition: boolean;
  reasons: BracketReason[];
  gameChangers: string[];
  massLandDenial: string[];
  extraTurns: string[];
  combos: FoundCombo[];
  /** Plain-language explanation for the deck page. */
  summary: string;
};

/**
 * Mass land denial: destroys, exiles or bounces lands en masse, or locks them down or changes the mana
 * they make (Armageddon, Jokulhaups, Sunder, Winter Orb, Blood Moon, Back to Basics). Single-target
 * land destruction (Strip Mine) doesn't count.
 */
export function isMassLandDenial(card: DeckCardInput): boolean {
  const t = rulesText(card);
  // "Destroy all nonbasic lands. ... its controller may search their library for a basic land card" replaces them.
  if (/\bdestroy all [^.]*lands\b[^]*\bsearch (?:their|his or her) library for (?:a|that many) basic land/.test(t)) return false;
  return (
    /\b(?:destroy|exile) all (?:(?!except)[^.])*\blands\b(?! you control)/.test(t) ||
    /\breturn all (?:nonbasic )?lands to their owners'? hands\b/.test(t) ||
    /\beach (?:player|opponent) sacrifices (?:all|x|three|four|five|six|seven|\d+) lands\b/.test(t) ||
    /\b(?:lands|nonbasic lands|permanents) (?:don't|do not) untap during (?:their controllers'|its controller's)? ?untap steps?\b/.test(t) ||
    /\bplayers can't untap more than (?:one|two) lands?\b/.test(t) ||
    /\bnonbasic lands are (?:mountains|islands|swamps|plains|forests)\b/.test(t) ||
    /\blands (?:your opponents control )?(?:are|become) (?:mountains|islands|swamps|plains|forests)\b(?! in addition)/.test(t) ||
    /\bif a land is tapped for mana, it produces colorless mana\b/.test(t)
  );
}

/** Cards that give extra turns ("Take an extra turn after this one", "takes two extra turns"). */
export function isExtraTurn(card: DeckCardInput): boolean {
  return /\btakes? (?:an|one|two|x|\w+) extra turns?\b/.test(rulesText(card));
}

/**
 * Earliest turn every piece can be in place with one land a turn and no ramp. Permanents can be cast on
 * earlier turns; instants and sorceries must all be cast on the final turn (Demonic Consultation has to
 * resolve alongside Thassa's Oracle); lands cost nothing but need a land drop each.
 */
export function comboTurn(...pieces: DeckCardInput[]): number {
  return comboTurnWith(pieces);
}

/**
 * `comboTurn`, plus the mana the final turn needs when known. Commander Spellbook's "mana needed" is what
 * the combo costs to run once its battlefield pieces are out: casting the pieces from hand, kickers,
 * equip and activation costs (Rite of Replication kicked is 7 more; Helm of the Host's equip is 5).
 */
export function comboTurnWith(pieces: readonly DeckCardInput[], finalTurnMana = 0): number {
  const lands = pieces.filter((c) => isLand(c)).length;
  const spells = pieces.filter((c) => !isLand(c) && /\b(?:Instant|Sorcery)\b/.test(frontType(c)));
  const now = Math.max(finalTurnMana, spells.reduce((n, c) => n + c.cmc, 0));
  const permanents = pieces
    .filter((c) => !isLand(c) && !spells.includes(c))
    .map((c) => c.cmc)
    .sort((a, b) => b - a);
  for (let turn = Math.max(1, lands, now); turn < 60; turn++) {
    // Mana free on each turn 1..turn; the last turn also pays for the instants and sorceries.
    const room = Array.from({ length: turn }, (_, i) => i + 1);
    room[turn - 1] -= now;
    if (fits(permanents, room)) return turn;
  }
  return 60;
}

/** Can these costs be split across turns with this much mana each? Small inputs, so plain backtracking. */
function fits(costs: number[], room: number[], i = 0): boolean {
  if (i === costs.length) return true;
  const tried = new Set<number>();
  for (let t = room.length - 1; t >= 0; t--) {
    if (room[t] < costs[i] || tried.has(room[t])) continue;
    tried.add(room[t]);
    room[t] -= costs[i];
    const ok = fits(costs, room, i + 1);
    room[t] += costs[i];
    if (ok) return true;
  }
  return false;
}

export function estimateBracket(entries: readonly DeckEntry[], opts: { combos?: readonly Combo[] } = {}): BracketEstimate {
  const deck = entries.filter((e) => e.board === "commander" || (e.board ?? "main") === "main" || e.board === "companion");
  const cards = new Map<string, DeckCardInput>();
  for (const e of deck) cards.set(e.card.name, e.card);
  const all = [...cards.values()];
  const reasons: BracketReason[] = [];

  const gameChangers = all.filter((c) => c.gameChanger).map((c) => c.name);
  if (gameChangers.length > 3) {
    reasons.push({ floor: 4, code: "game-changers", cards: gameChangers, message: `${gameChangers.length} Game Changers. Bracket 3 allows up to 3.` });
  } else if (gameChangers.length > 0) {
    reasons.push({ floor: 3, code: "game-changers", cards: gameChangers, message: `${gameChangers.length} Game Changer${gameChangers.length === 1 ? "" : "s"}. Brackets 1 and 2 allow none.` });
  }

  const massLandDenial = all.filter(isMassLandDenial).map((c) => c.name);
  if (massLandDenial.length) {
    reasons.push({ floor: 4, code: "mass-land-denial", cards: massLandDenial, message: `Mass land denial (${massLandDenial.join(", ")}) is only for Brackets 4 and 5.` });
  }

  const extraTurns = all.filter(isExtraTurn).map((c) => c.name);
  if (extraTurns.length >= 3) {
    reasons.push({ floor: 4, code: "extra-turns-chain", cards: extraTurns, message: `${extraTurns.length} extra-turn cards are likely to chain. Brackets 2 and 3 allow a few, never chained.` });
  } else if (extraTurns.length > 0) {
    reasons.push({ floor: 2, code: "extra-turns", cards: extraTurns, message: `Extra turns (${extraTurns.join(", ")}). Bracket 1 has none; 2 and 3 allow a few if they aren't chained.` });
  }

  const combos: FoundCombo[] = findCombos(cards.keys(), opts.combos ?? KNOWN_TWO_CARD_COMBOS)
    .map((c) => {
      const earliestTurn = comboTurnWith(
        c.cards.map((n) => cards.get(n)!),
        c.manaValueNeeded,
      );
      const early = earliestTurn <= 5;
      const twoCard = isTwoCardCombo(c);
      return { ...c, earliestTurn, early, twoCard, floor: comboFloor(c, twoCard, early) };
    })
    .sort((a, b) => b.floor - a.floor || Number(b.twoCard) - Number(a.twoCard) || a.earliestTurn - b.earliestTurn);
  const early = combos.filter((c) => c.floor === 4);
  const late = combos.filter((c) => c.floor === 3);
  if (early.length) {
    reasons.push({
      floor: 4,
      code: "combo-early",
      cards: [...new Set(early.flatMap((c) => c.cards))],
      message: `Early two-card combo${early.length === 1 ? "" : "s"}: ${early.map((c) => `${c.cards.join(" + ")} (by turn ${c.earliestTurn})`).join("; ")}. Bracket 3 only allows late-game combos.`,
    });
  }
  if (late.length) {
    const why = (c: FoundCombo) => (c.early ? "Commander Spellbook rates it Bracket 3" : "late game");
    reasons.push({
      floor: 3,
      code: "combo-late",
      cards: [...new Set(late.flatMap((c) => c.cards))],
      message: `Two-card combo${late.length === 1 ? "" : "s"}: ${late.map((c) => `${c.cards.join(" + ")} (${why(c)})`).join("; ")}. Fine in Bracket 3, not in 1 or 2.`,
    });
  }

  const floor = Math.max(2, ...reasons.map((r) => r.floor)) as Bracket;
  // Bracket 1 has no two-card combos at all, even slow ones.
  const couldBeExhibition = reasons.length === 0 && !combos.some((c) => c.twoCard);
  const info = BRACKETS[floor];
  const bigger = combos.filter((c) => c.relevant !== false && c.cards.length + (c.templates?.length ?? 0) > 2).length;
  const slow = combos.filter((c) => c.twoCard && c.floor === 2).length;
  const biggerNote =
    (bigger
      ? ` It also has ${bigger} combo${bigger === 1 ? "" : "s"} that need${bigger === 1 ? "s" : ""} three or more pieces. The bracket rules don't limit those, but it's worth telling your pod.`
      : "") +
    (slow ? ` ${slow === 1 ? "One two-card combo is" : `${slow} two-card combos are`} slow or clunky enough that Commander Spellbook allows ${slow === 1 ? "it" : "them"} in Bracket 2.` : "");
  const summary =
    (floor === 2
      ? couldBeExhibition
        ? "Bracket 2 (Core): no Game Changers, land denial, extra turns or known two-card combos. If it's built around a theme for fun rather than power, call it Bracket 1."
        : "Bracket 2 (Core): no Game Changers, land denial or two-card combos that need a higher bracket."
      : floor === 4
        ? `At least Bracket 4 (Optimized). ${reasons.filter((r) => r.floor === 4).map((r) => r.message).join(" ")} Bracket 5 is the same cards played for a competitive pod.`
        : `Bracket 3 (Upgraded). ${reasons.filter((r) => r.floor === 3).map((r) => r.message).join(" ")}`) + biggerNote;

  return {
    bracket: floor,
    name: info.name,
    couldBeExhibition,
    reasons: reasons.sort((a, b) => b.floor - a.floor),
    gameChangers,
    massLandDenial,
    extraTurns,
    combos,
    summary,
  };
}
