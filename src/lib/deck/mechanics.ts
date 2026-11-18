/**
 * Deck mechanics for the synergy check (src/lib/deck/synergy.ts): what each card does for a
 * mechanic, read from its rules text. A mechanic has two sides that work together:
 * - enablers make the thing the mechanic counts (tokens, +1/+1 counters, cards in the graveyard),
 * - payoffs reward it ("whenever a creature you control dies", "for each artifact you control").
 * A card can be both (a lord in a typal deck). Strengths are 0..1. Pure: no database code.
 */
import type { DeckCardInput } from "./types";
import { faceTypes, frontType, isLand, rulesText } from "./text";
import { typalLabel, typalSlug } from "./theme-catalog";

export type MechanicSide = { enabler: number; payoff: number };

export type MechanicDef = {
  id: string;
  label: string;
  /** EDHREC theme slugs that mean this mechanic (a deck's theme, and where to look for more cards). */
  slugs: string[];
  /** What a card does for it. */
  side: (c: CardFacts) => MechanicSide;
  /**
   * Some mechanics are in every deck on one side (every deck has creatures that do something when
   * they enter); those only count as a deck mechanic when the other side shows up enough.
   */
  needs?: { enablers?: number; payoffs?: number };
};

/** What the patterns read: the card's prepared rules text and type lines. */
export type CardFacts = {
  card: DeckCardInput;
  text: string;
  types: string;
  front: string;
  keywords: string[];
  land: boolean;
  creature: boolean;
};

export function cardFacts(card: DeckCardInput): CardFacts {
  const front = frontType(card);
  return {
    card,
    // New Oracle wording says "this creature" where older cards say their name; read both the same.
    text: rulesText(card).replace(/\bthis (?:creature|artifact|enchantment|land|planeswalker|permanent|spell|vehicle|equipment|aura|saga|battle)\b/g, "this card"),
    types: faceTypes(card).join(" // "),
    front,
    keywords: (card.keywords ?? []).map((k) => k.toLowerCase()),
    land: isLand(card),
    creature: /\bCreature\b/.test(front),
  };
}

const any = (text: string, res: RegExp[]) => res.some((r) => r.test(text));
const has = (f: CardFacts, ...kw: string[]) => kw.some((k) => f.keywords.includes(k) || new RegExp(`\\b${k}\\b`).test(f.text));
const side = (enabler: number, payoff: number): MechanicSide => ({ enabler, payoff });

const CREATE_CREATURE_TOKEN = [
  /\bcreates? [^.]*?\b(?:\d+|x)\/(?:\d+|x)\b[^.]*?\btokens?\b/,
  /\bcreates? [^.]*?\bcreature tokens?\b/,
  /\bcreates? [^.]*?\btokens? that'?s? (?:a )?cop(?:y|ies) of\b/,
  /\bpopulate\b/,
  /\bamass\b/,
  /\b(?:embalm|eternalize|myriad|fabricate|afterlife|encore|incubate)\b/,
];
/** Tokens you make (not "its controller creates a 3/3 Ape", which gives one to an opponent). */
const makesTokens = (t: string) => any(t.replace(/[^.]*\b(?:its controller|that player|target opponent|each opponent|an opponent|its owner|target player) creates?\b[^.]*\.?/g, ""), CREATE_CREATURE_TOKEN);
const ARTIFACT_TOKEN = /\bcreates? [^.]*?\b(?:treasure|clue|food|blood|map|powerstone|gold|junk|incubator|artifact)\b[^.]*?\btokens?\b/;

export const MECHANICS: MechanicDef[] = [
  {
    id: "tokens",
    label: "Tokens",
    slugs: ["tokens", "go-wide", "populate"],
    side: (f) => {
      const enabler = makesTokens(f.text) ? 1 : 0;
      let payoff = 0;
      if (/\bif (?:an? )?(?:effect|one or more)?[^.]*would create (?:one or more |a )?tokens?\b/.test(f.text)) payoff = 1;
      else if (/\bwhenever (?:you create (?:a|one or more) (?:[\w/+-]+ ){0,3}tokens?\b|(?:a|one or more|another) (?:nontoken )?(?:[\w-]+ )?(?:creature )?tokens? (?:you control )?(?:enters?|dies?|die|leaves?)\b)/.test(f.text)) payoff = 1;
      else if (/\bwhenever (?:this card or )?(?:a|one or more|another)(?: other)?(?: nontoken)? creatures? (?:you control )?enters?\b(?! under an opponent's control)/.test(f.text)) payoff = 0.9;
      else if (/\bcreatures you control get \+\d+\/\+\d+\b/.test(f.text) || /\bfor each creature you control\b/.test(f.text)) payoff = 0.8;
      else if (has(f, "convoke") || /\btap (?:an untapped|\w+ untapped) creatures? you control\b/.test(f.text)) payoff = 0.6;
      if (/\bpopulate\b/.test(f.text)) payoff = Math.max(payoff, 0.8);
      return side(enabler, payoff);
    },
  },
  {
    id: "counters",
    label: "+1/+1 counters",
    slugs: ["plus-1-plus-1-counters", "counters", "proliferate"],
    side: (f) => {
      const t = f.text;
      let enabler = 0;
      if (/\bputs? (?:a|an|one|two|three|four|five|x|that many|\w+) (?:additional )?\+1\/\+1 counters? on\b/.test(t)) enabler = 1;
      else if (/\benters? (?:the battlefield )?with (?:a|an|one|two|three|four|five|x|\w+) (?:additional )?\+1\/\+1 counters?\b/.test(t)) enabler = 0.7;
      else if (has(f, "adapt", "bolster", "evolve", "outlast", "support", "modular", "training", "mentor", "graft", "backup", "reinforce")) enabler = 0.8;
      const proliferate = /\bproliferate\b/.test(t);
      let payoff = 0;
      if (/\bif [^.]*would (?:put|be put)[^.]*counters?[^.]*(?:twice|that many plus|instead)\b/.test(t) || /\bdouble the number of [^.]*counters\b/.test(t)) payoff = 1;
      else if (/\bwhenever (?:one or more )?\+1\/\+1 counters? (?:are|is) put\b/.test(t)) payoff = 1;
      else if (/\b(?:creatures?|permanents?) (?:you control )?with (?:a |one or more )?\+1\/\+1 counters? on (?:it|them)\b/.test(t)) payoff = 0.9;
      else if (/\bfor each \+1\/\+1 counter\b/.test(t) || /\bmove (?:a|any number of|all) \+1\/\+1 counters?\b/.test(t) || /\bremove (?:a|x|one or more|\w+) \+1\/\+1 counters? from\b/.test(t)) payoff = 0.7;
      if (proliferate) {
        enabler = Math.max(enabler, 0.6);
        payoff = Math.max(payoff, 0.8);
      }
      return side(enabler, payoff);
    },
  },
  {
    id: "sacrifice",
    label: "Sacrifice",
    slugs: ["aristocrats", "sacrifice"],
    side: (f) => {
      const t = f.text;
      let enabler = 0;
      // Sacrifice outlets, and creatures worth sacrificing.
      if (/\bsacrifice (?:a|an|another|one or more|x|two) (?:other )?(?:nontoken )?(?:creature|permanent|artifact or creature|creature or artifact)s?\b[^.:]*:/.test(t)) enabler = 1;
      else if (/\bsacrifices? (?:a|an|another|any number of|x|two|three) (?:other )?(?:nontoken )?creatures?\b/.test(t) && !/\beach (?:player|opponent) sacrifices\b/.test(t)) enabler = 0.8;
      else if (f.creature && /\bwhen this card dies\b/.test(t)) enabler = 0.6;
      else if (makesTokens(t)) enabler = 0.4;
      let payoff = 0;
      if (/\bwhenever (?:this card or )?(?:a|an|another|one or more)(?: other)?(?: nontoken)? creatures? (?:you control )?(?:dies|die)\b/.test(t)) payoff = 1;
      else if (/\bwhenever you sacrifice\b/.test(t) || /\bwhenever (?:a|another) [^.]*?\bis put into (?:a|your) graveyard from the battlefield\b/.test(t)) payoff = 1;
      else if (/\bwhenever (?:a|another|one or more) creatures? (?:an opponent controls|your opponents control) (?:dies|die)\b/.test(t)) payoff = 0.8;
      else if (/\bcreatures? (?:that )?died this turn\b/.test(t)) payoff = 0.6;
      return side(enabler, payoff);
    },
  },
  {
    id: "graveyard",
    label: "Graveyard",
    slugs: ["reanimator", "graveyard", "self-mill", "dredge"],
    side: (f) => {
      const t = f.text;
      let enabler = 0;
      if (/\b(?:you )?mills? (?:a|an|one|two|three|four|five|six|seven|x|\w+) cards?\b/.test(t) && !/\b(?:each opponent|target opponent) mills\b/.test(t)) enabler = 0.8;
      if (/\bput the top \w+ cards? of your library into your graveyard\b/.test(t) || has(f, "dredge")) enabler = 1;
      if (has(f, "surveil") || /\bdraws? [^.]*\bthen discards?\b/.test(t) || /\bdiscards? (?:a|two|\w+) cards?[^.]*:?[^.]*\bdraw\b/.test(t)) enabler = Math.max(enabler, 0.6);
      if (/\bentomb\b|\bsearch your library for a card[^.]*put (?:it|that card) into your graveyard\b/.test(t)) enabler = 1;
      if (/\bputs? (?:the rest|them|those cards|the other|that card|\w+ cards?)[^.]*? into your graveyard\b/.test(t)) enabler = Math.max(enabler, 0.8);
      // Sacrifice outlets fill the graveyard with creatures too.
      if (/\bsacrifice (?:a|an|another) (?:other )?creature\b[^.:]*:/.test(t)) enabler = Math.max(enabler, 0.5);
      let payoff = 0;
      if (/\b(?:return|put) [^.]*?\bcreature cards? [^.]*?\bfrom (?:your|a|any) graveyards? (?:on)?to the battlefield\b/.test(t)) payoff = 1;
      else if (/\bcreature cards? in your graveyard\b[^]*?\breturn (?:it|them|that card) to the battlefield\b/.test(t)) payoff = 1;
      else if (/\bfrom (?:your|a) graveyard (?:on)?to the battlefield\b/.test(t)) payoff = 0.9;
      else if (/\breturn [^.]*?\bcards? from your graveyard to your hand\b/.test(t)) payoff = 0.6;
      else if (/\bfor each (?:creature )?card in your graveyard\b|\bcards? in your graveyard\b[^.]*\b(?:get|gets|has|have)\b|\bseven or more cards in your graveyard\b|\bthreshold\b|\bdelirium\b/.test(t)) payoff = 0.8;
      else if (/\byou may (?:cast|play) [^.]*?\bfrom your graveyard\b/.test(t) && !/\byou may cast this card from your graveyard\b/.test(t)) payoff = 0.9;
      else if (has(f, "delve", "escape", "flashback", "unearth", "embalm", "eternalize", "disturb", "scavenge", "retrace", "jump-start")) payoff = 0.5;
      else if (/\bmadness\b|\bwhenever you discard\b/.test(t)) payoff = 0.7;
      return side(enabler, payoff);
    },
  },
  {
    id: "spells",
    label: "Instants & sorceries",
    slugs: ["spellslinger", "spells", "storm", "prowess"],
    side: (f) => {
      const t = f.text;
      const enabler = /\b(?:Instant|Sorcery)\b/.test(f.front) ? 0.6 : 0;
      let payoff = 0;
      if (/\bwhenever you cast (?:an?|your first|your second)? ?(?:instant|sorcery|noncreature)\b/.test(t) || has(f, "magecraft")) payoff = 1;
      else if (/\b(?:instant|sorcery) (?:and|or) (?:instant|sorcery) spells? you cast (?:cost|have)\b|\bcopy (?:target|that) (?:instant|sorcery)\b|\bcopy (?:it|that spell)\b[^.]*\binstant or sorcery\b/.test(t)) payoff = 0.9;
      else if (/\binstant (?:and|or) sorcery cards? (?:in|from) your graveyard\b|\bstorm\b/.test(t)) payoff = 0.8;
      else if (has(f, "prowess")) payoff = 0.6;
      return side(enabler, payoff);
    },
  },
  {
    id: "artifacts",
    label: "Artifacts",
    slugs: ["artifacts", "treasure", "affinity", "improvise"],
    side: (f) => {
      const t = f.text;
      let enabler = /\bArtifact\b/.test(f.types) ? 0.6 : 0;
      if (ARTIFACT_TOKEN.test(t)) enabler = 1;
      let payoff = 0;
      if (/\bwhenever (?:this card or )?(?:an?|one or more|another)(?: other)?(?: nontoken)? artifacts? (?:you control )?(?:enters?|is put into)\b|\bwhenever you cast an artifact spell\b|\bwhenever you sacrifice (?:a|an|another) (?:treasure|artifact|clue|food)\b/.test(t)) payoff = 1;
      else if (/\bfor each artifact you control\b|\bartifact spells? you cast cost\b|\bthree or more artifacts\b|\bartifacts? you control (?:have|get)\b/.test(t) || has(f, "affinity", "improvise", "metalcraft")) payoff = 0.9;
      else if (/\bsacrifice (?:a|an|another) (?:artifact|treasure)\b/.test(t) && !/\bsacrifice this (?:card|artifact)\b/.test(t)) payoff = 0.6;
      return side(enabler, payoff);
    },
  },
  {
    id: "enchantments",
    label: "Enchantments",
    slugs: ["enchantress", "enchantments", "constellation"],
    side: (f) => {
      const t = f.text;
      const enabler = /\bEnchantment\b/.test(f.types) ? 0.6 : /\bcreates? [^.]*\benchantment\b[^.]*\btokens?\b/.test(t) ? 0.8 : 0;
      let payoff = 0;
      if (/\bwhenever (?:you cast )?(?:this card or )?(?:an?|another|one or more)(?: other)? enchantments?\b/.test(t)) payoff = 1;
      else if (/\bfor each enchantment you control\b|\benchantment spells? you cast cost\b|\benchantments? you control (?:have|get)\b/.test(t)) payoff = 0.9;
      return side(enabler, payoff);
    },
  },
  {
    id: "landfall",
    label: "Landfall",
    slugs: ["landfall", "lands-matter", "lands"],
    side: (f) => {
      const t = f.text;
      let enabler = 0;
      if (/\byou may play (?:an? )?additional lands?\b|\bplay (?:lands|an additional land) from your graveyard\b|\byou may play lands from your graveyard\b/.test(t)) enabler = 1;
      else if (/\bsearch your library for [^.]*?\blands? cards?\b[^.]*?\bput (?:it|them|those cards|one of them|that card|one) onto the battlefield\b/.test(t)) enabler = 0.8;
      else if (/\bput (?:a|up to \w+|any number of) lands? cards? from your hand onto the battlefield\b|\breturn [^.]*?\blands? cards? from your graveyard to the battlefield\b/.test(t)) enabler = 0.8;
      else if (/\breturn (?:a|target) land you control to its owner's hand\b/.test(t) && !f.land) enabler = 0.5;
      let payoff = 0;
      if (/\blandfall\b|\bwhenever (?:a|one or more) lands? (?:you control )?enters?\b|\bwhenever you play a land\b/.test(t)) payoff = 1;
      else if (/\bfor each land you control\b|\blands you control (?:have|are)\b/.test(t)) payoff = 0.6;
      return side(enabler, payoff);
    },
  },
  {
    id: "lifegain",
    label: "Lifegain",
    slugs: ["lifegain", "life-gain"],
    side: (f) => {
      const t = f.text;
      let enabler = 0;
      if (has(f, "lifelink") || /\b(?:you )?gains? (?:\d+|x|that much|\w+) life\b/.test(t)) enabler = /\beach opponent loses\b[^.]*\byou gain\b|\bwhenever\b[^.]*\byou gain \d+ life\b/.test(t) ? 1 : 0.7;
      let payoff = 0;
      if (/\bwhenever you gain life\b|\bif you would gain life\b/.test(t)) payoff = 1;
      else if (/\bgained (?:\d+|x|\w+) or more life\b|\blife you(?:'ve)? gained\b|\bif you gained life this turn\b/.test(t)) payoff = 0.8;
      return side(enabler, payoff);
    },
  },
  {
    id: "blink",
    label: "Blink & enter effects",
    slugs: ["blink", "flicker", "etb"],
    needs: { enablers: 2 },
    side: (f) => {
      const t = f.text;
      let enabler = 0;
      if (/\bexile (?:up to \w+ )?(?:another |other )?target (?:nontoken )?(?:creatures?|permanents?|artifacts?|nonland permanents?)\b[^.]*?(?:you control|you own)?[^.]*?(?:\.|,) (?:then )?return (?:it|that card|those cards|them|the exiled cards?)\b[^.]*?\bto the battlefield\b/.test(t)) enabler = 1;
      else if (/\bat the beginning of the next end step, return (?:it|that card|the exiled card|those cards) to the battlefield\b/.test(t)) enabler = 0.9;
      else if (/\btriggers an additional time\b/.test(t) && /\benter/.test(t)) enabler = 1;
      const etb = f.creature && /\bwhen this card enters\b/.test(t) ? 0.6 : 0;
      return side(enabler, etb);
    },
  },
  {
    id: "voltron",
    label: "Equipment & Auras",
    slugs: ["voltron", "equipment", "auras", "aura"],
    side: (f) => {
      const t = f.text;
      let enabler = 0;
      if (/\bEquipment\b/.test(f.types) || (/\bAura\b/.test(f.types) && /\benchant creature\b|\benchanted creature (?:gets|has)\b/.test(t))) enabler = 0.8;
      let payoff = 0;
      if (/\bwhenever (?:an?|one or more) (?:equipment|aura)s? (?:you control )?(?:enters|becomes attached|is attached)\b|\bequip abilities you activate cost\b|\bfor each (?:aura|equipment)\b|\bfor each (?:aura and equipment|equipment and aura)\b/.test(t)) payoff = 1;
      else if (/\b(?:equipped|enchanted) creatures? you control\b|\bcreatures? you control that (?:are|is) (?:enchanted|equipped)\b|\battach (?:target|an?|any number of|all) (?:equipment|auras?)\b|\bauras? you control\b|\bequipment you control\b/.test(t)) payoff = 0.9;
      else if (/\bequip \{0\}|\bequipped creature\b/.test(t) && !/\bEquipment\b/.test(f.types)) payoff = 0.6;
      return side(enabler, payoff);
    },
  },
  {
    id: "draw",
    label: "Card draw triggers",
    slugs: ["wheels", "card-draw", "draw"],
    needs: { payoffs: 2 },
    side: (f) => {
      const t = f.text;
      let enabler = 0;
      if (/\beach player (?:discards their hand|shuffles their hand[^.]*), then draws\b|\beach player draws (?:\w+|x) cards\b/.test(t)) enabler = 1;
      else if (/\bdraws? (?:two|three|four|five|x|\w+) cards\b/.test(t)) enabler = 0.5;
      else if (/\bdraws? a card\b/.test(t) && /\bwhenever\b/.test(t)) enabler = 0.5;
      let payoff = 0;
      if (/\bwhenever (?:you|a player|an opponent|each player) draws? (?:a|your second|one or more|their second)? ?cards?\b|\bwhenever you draw your second card\b/.test(t)) payoff = 1;
      return side(enabler, payoff);
    },
  },
  {
    id: "poison",
    label: "Poison & infect",
    slugs: ["infect", "poison", "toxic", "proliferate"],
    side: (f) => {
      const t = f.text;
      let enabler = 0;
      if (has(f, "infect", "toxic", "poisonous") || /\bpoison counters?\b/.test(t) && !/\b(?:has|have) (?:\w+ )?or more poison counters\b/.test(t)) enabler = 1;
      let payoff = 0;
      if (/\bcorrupted\b|\b(?:has|have|with) (?:three|\w+) or more poison counters\b|\bfor each poison counter\b/.test(t)) payoff = 1;
      if (/\bproliferate\b/.test(t)) payoff = Math.max(payoff, 0.9);
      return side(enabler, payoff);
    },
  },
  {
    id: "superfriends",
    label: "Planeswalkers",
    slugs: ["superfriends", "planeswalkers"],
    side: (f) => {
      const t = f.text;
      const enabler = /\bPlaneswalker\b/.test(f.types) ? 0.8 : 0;
      let payoff = 0;
      if (/\bplaneswalkers? you control\b|\bwhenever you activate a loyalty ability\b|\bloyalty abilities? of\b|\badditional loyalty\b|\bplaneswalker spells? you cast\b/.test(t)) payoff = 1;
      else if (/\bproliferate\b/.test(t)) payoff = 0.7;
      return side(enabler, payoff);
    },
  },
  {
    id: "mill",
    label: "Mill",
    slugs: ["mill"],
    side: (f) => {
      const t = f.text;
      const enabler = /\b(?:target player|each opponent|target opponent|each player) mills\b|\bmills? (?:\w+ )?cards? equal\b/.test(t) && !/\byou mill\b/.test(t) ? 1 : 0;
      const payoff = /\bwhenever (?:a|one or more) cards? (?:are|is) put into an opponent's graveyard\b|\bcards? in (?:each opponent's|opponents') graveyards?\b|\bwhenever an opponent mills\b/.test(t) ? 1 : 0;
      return side(enabler, payoff);
    },
  },
];

export const MECHANIC_BY_ID = new Map(MECHANICS.map((m) => [m.id, m]));

/** The mechanic a theme slug means, if one of the built-in ones does. */
export function mechanicForSlug(slug: string): MechanicDef | undefined {
  return MECHANICS.find((m) => m.slugs.includes(slug));
}

/** Creature types on a card (each face), e.g. ["Elf", "Druid"]. Changelings have every type. */
export function creatureTypes(card: Pick<DeckCardInput, "typeLine" | "cardFaces">): string[] {
  const out = new Set<string>();
  for (const t of faceTypes(card)) {
    const [left, right] = t.split(/\s+—\s+|\s+-\s+/);
    if (!right || !/\b(?:Creature|Kindred|Tribal)\b/.test(left)) continue;
    for (const w of right.split(/\s+/)) if (w) out.add(w);
  }
  return [...out];
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** A typal ("tribal") mechanic for one creature type. */
export function typalMechanic(type: string): MechanicDef {
  const plural = typalSlug(type).replace(/-/g, " ");
  const word = new RegExp(`\\b(?:${escape(type.toLowerCase())}s?|${escape(plural)})\\b`);
  return {
    id: `typal:${type}`,
    label: typalLabel(type),
    slugs: [typalSlug(type)],
    needs: { payoffs: 3 },
    side: (f) => {
      const ofType = creatureTypes(f.card).includes(type) ? 1 : 0;
      const changeling = has(f, "changeling") ? 0.8 : 0;
      let payoff = 0;
      if (word.test(f.text.replace(/\bnon-[a-z]+/g, ""))) payoff = 1;
      else if (/\bchoose a creature type\b|\bcreatures? of the chosen type\b|\bshares? a creature type\b/.test(f.text)) payoff = 0.6;
      return side(Math.max(ofType, changeling), payoff);
    },
  };
}

