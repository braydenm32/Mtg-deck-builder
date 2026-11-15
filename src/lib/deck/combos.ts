/**
 * Combos and how to match them against a deck.
 *
 * The app's main source is Commander Spellbook (src/lib/spellbook/), which lists tens of thousands of
 * combos of any size. `KNOWN_TWO_CARD_COMBOS` is the offline fallback: well-known two-card infinite
 * combos, used when Spellbook can't be reached or is switched off. Card names are exact Scryfall names;
 * `note` says when the combo needs something common besides the pieces.
 */

/** Commander Spellbook's bracket tag for a combo: Ruthless, Spicy, Powerful, Oddball, Core, Exhibition, Banned. */
export type SpellbookBracketTag = "R" | "S" | "P" | "O" | "C" | "E" | "B";

export type Combo = {
  /** The named cards it needs (two or more). */
  cards: string[];
  result: string;
  note?: string;
  /** Non-card pieces Spellbook asks for, e.g. "Sacrifice outlet". A combo with any isn't a two-card combo. */
  templates?: string[];
  /**
   * False when the combo only makes a helper effect (Spellbook features that aren't "standalone", such
   * as infinite storm count with no payoff). Missing means true. Only relevant combos move the bracket.
   */
  relevant?: boolean;
  /** Commander Spellbook variant id, link and data, when the combo came from there. */
  id?: string;
  url?: string;
  bracketTag?: SpellbookBracketTag;
  popularity?: number;
  /** Mana Spellbook says the combo needs once its battlefield pieces are out, e.g. "{U}{U}{B}", and as a number. */
  manaNeeded?: string;
  manaValueNeeded?: number;
};

/** A combo the Commander Brackets rules mean by "two-card combo": exactly two named cards, nothing else needed. */
export function isTwoCardCombo(c: Combo): boolean {
  return c.cards.length === 2 && !c.templates?.length && c.relevant !== false;
}

export const KNOWN_TWO_CARD_COMBOS: readonly Combo[] = [
  { cards: ["Thassa's Oracle", "Demonic Consultation"], result: "Win the game" },
  { cards: ["Thassa's Oracle", "Tainted Pact"], result: "Win the game" },
  { cards: ["Isochron Scepter", "Dramatic Reversal"], result: "Infinite mana and untaps", note: "Needs nonland mana sources making 3+ mana" },
  { cards: ["Exquisite Blood", "Sanguine Bond"], result: "Infinite life drain" },
  { cards: ["Exquisite Blood", "Vito, Thorn of the Dusk Rose"], result: "Infinite life drain" },
  { cards: ["Heliod, Sun-Crowned", "Walking Ballista"], result: "Infinite damage and life" },
  { cards: ["Mikaeus, the Unhallowed", "Walking Ballista"], result: "Infinite damage" },
  { cards: ["Mikaeus, the Unhallowed", "Triskelion"], result: "Infinite damage" },
  { cards: ["Kiki-Jiki, Mirror Breaker", "Zealous Conscripts"], result: "Infinite hasty creatures" },
  { cards: ["Kiki-Jiki, Mirror Breaker", "Pestermite"], result: "Infinite hasty creatures" },
  { cards: ["Kiki-Jiki, Mirror Breaker", "Deceiver Exarch"], result: "Infinite hasty creatures" },
  { cards: ["Splinter Twin", "Pestermite"], result: "Infinite hasty creatures" },
  { cards: ["Splinter Twin", "Deceiver Exarch"], result: "Infinite hasty creatures" },
  { cards: ["Dualcaster Mage", "Twinflame"], result: "Infinite hasty creatures" },
  { cards: ["Dualcaster Mage", "Heat Shimmer"], result: "Infinite hasty creatures" },
  { cards: ["Saheeli Rai", "Felidar Guardian"], result: "Infinite hasty creatures" },
  { cards: ["Basalt Monolith", "Rings of Brighthearth"], result: "Infinite colourless mana" },
  { cards: ["Basalt Monolith", "Power Artifact"], result: "Infinite colourless mana" },
  { cards: ["Grim Monolith", "Power Artifact"], result: "Infinite colourless mana" },
  { cards: ["Kinnan, Bonder Prodigy", "Basalt Monolith"], result: "Infinite colourless mana" },
  { cards: ["Grand Architect", "Pili-Pala"], result: "Infinite mana" },
  { cards: ["Bloom Tender", "Freed from the Real"], result: "Infinite mana" },
  { cards: ["Devoted Druid", "Vizier of Remedies"], result: "Infinite green mana" },
  { cards: ["Peregrine Drake", "Deadeye Navigator"], result: "Infinite mana" },
  { cards: ["Food Chain", "Squee, the Immortal"], result: "Infinite creature mana" },
  { cards: ["Food Chain", "Eternal Scourge"], result: "Infinite creature mana" },
  { cards: ["Food Chain", "Misthollow Griffin"], result: "Infinite creature mana" },
  { cards: ["Worldgorger Dragon", "Animate Dead"], result: "Infinite mana and ETBs" },
  { cards: ["Niv-Mizzet, Parun", "Curiosity"], result: "Infinite damage and draw" },
  { cards: ["Niv-Mizzet, Parun", "Ophidian Eye"], result: "Infinite damage and draw" },
  { cards: ["Niv-Mizzet, Parun", "Tandem Lookout"], result: "Infinite damage and draw" },
  { cards: ["Painter's Servant", "Grindstone"], result: "Mill your opponents' libraries" },
  { cards: ["Helm of Obedience", "Rest in Peace"], result: "Exile your opponents' libraries" },
  { cards: ["Chatterfang, Squirrel General", "Pitiless Plunderer"], result: "Infinite tokens, Treasure and drain" },
  { cards: ["Professor Onyx", "Chain of Smog"], result: "Infinite drain" },
  { cards: ["Witherbloom Apprentice", "Chain of Smog"], result: "Infinite drain" },
  { cards: ["Spike Feeder", "Archangel of Thune"], result: "Infinite life and counters" },
  { cards: ["Scurry Oak", "Ivy Lane Denizen"], result: "Infinite Squirrels" },
  { cards: ["Godo, Bandit Warlord", "Helm of the Host"], result: "Infinite combat phases" },
  { cards: ["Aggravated Assault", "Sword of Feast and Famine"], result: "Infinite combat phases" },
  { cards: ["Mindcrank", "Bloodchief Ascension"], result: "Mill and drain your opponents out" },
  { cards: ["Mindcrank", "Duskmantle Guildmage"], result: "Mill your opponents out" },
];

/** Combos whose pieces are all in the deck (by name). */
export function findCombos(names: Iterable<string>, combos: readonly Combo[] = KNOWN_TWO_CARD_COMBOS): Combo[] {
  const have = new Set(names);
  return combos.filter((c) => c.cards.every((n) => have.has(n)));
}

/** Combos where the deck has all but one piece, and the one it's missing. Useful for "you're one card away". */
export function nearCombos(names: Iterable<string>, combos: readonly Combo[] = KNOWN_TWO_CARD_COMBOS): { combo: Combo; missing: string }[] {
  const have = new Set(names);
  const out: { combo: Combo; missing: string }[] = [];
  for (const c of combos) {
    const missing = c.cards.filter((n) => !have.has(n));
    if (missing.length === 1) out.push({ combo: c, missing: missing[0] });
  }
  return out;
}
