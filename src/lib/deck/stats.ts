/**
 * Deck statistics for the deck page: mana curve, card types, colour pips vs. colour sources,
 * land-count advice and the role checklist. Pure functions over a decklist.
 *
 * Conventions:
 * - The curve, types and average mana value cover the main deck (the 99). Commanders are reported
 *   separately, because they live in the command zone.
 * - Pips include the commanders' costs: you cast your commander more often than any other card.
 * - MDFC spell//lands are counted as spells in the curve and listed in `mdfcLands`; for land advice
 *   they count as half a land.
 */
import { colorString } from "@/lib/cards/normalize";
import { atLeast, cardsSeen, commanderLibrary, openingHandLands } from "./probability";
import { cardRoles, ROLE_TARGETS, ROLES, type Role } from "./roles";
import { frontType, isLand, isMdfcLand, pipCounts, rulesText } from "./text";
import { COLORS, type Color, type DeckCardInput, type DeckEntry } from "./types";

export const CARD_TYPES = ["Creature", "Instant", "Sorcery", "Artifact", "Enchantment", "Planeswalker", "Battle", "Land"] as const;
export type CardType = (typeof CARD_TYPES)[number];

export type CurveBucket = {
  /** 0..6, and 7 meaning "7 or more". */
  manaValue: number;
  count: number;
  permanents: number;
  spells: number;
};

export type ColorStat = {
  color: Color;
  /** Coloured pips of this colour across the commanders' and main deck's costs. */
  pips: number;
  pipShare: number;
  /** Lands that can make this colour. */
  landSources: number;
  /** Nonland mana sources (rocks, dorks, Treasure makers aren't counted) that can make this colour. */
  otherSources: number;
  /** The main-deck card hardest to cast on curve in this colour, and the odds of having enough land sources for it on time. */
  hardest?: { name: string; pips: number; manaValue: number; chanceOnCurve: number };
};

export type LandAdvice = {
  lands: number;
  mdfcLands: number;
  /** lands + mdfcLands / 2 */
  effectiveLands: number;
  recommended: number;
  /** Positive: add this many lands. Negative: room to cut. Within ±1 counts as fine. */
  delta: number;
  cheapRampAndDraw: number;
  averageManaValue: number;
  /** Plain-language summary for the deck page. */
  summary: string;
};

export type RoleLine = { role: Role; count: number; min: number; target: number; status: "low" | "ok" };

export type DeckStats = {
  /** Commanders + main deck. */
  totalCards: number;
  commanders: string[];
  colorIdentity: string;
  lands: number;
  mdfcLands: number;
  nonlands: number;
  curve: CurveBucket[];
  /** Average mana value of the main deck's nonland cards. */
  averageManaValue: number;
  /** Same, counting lands as 0 (the figure some sites show). */
  averageManaValueWithLands: number;
  types: Record<CardType, number>;
  colors: ColorStat[];
  colorlessSources: number;
  landAdvice: LandAdvice;
  roles: Record<Role, number>;
  checklist: RoleLine[];
  gameChangers: string[];
  /** Only when `prices: true`. Sum of priceUsd × quantity; cards without a price are listed. */
  price?: { totalUsd: number; unpriced: string[] };
  /** P(k lands in the opening 7), k = 0..7. */
  openingHandLands: number[];
};

const round = (n: number, places = 2) => Math.round(n * 10 ** places) / 10 ** places;

const LAND_TYPE_COLORS: [RegExp, Color][] = [
  [/\bPlains\b/, "W"],
  [/\bIsland\b/, "U"],
  [/\bSwamp\b/, "B"],
  [/\bMountain\b/, "R"],
  [/\bForest\b/, "G"],
];

/**
 * Colours of mana a card can produce, limited to the deck's identity. Uses Scryfall's
 * `produced_mana` when present; otherwise reads land types and "Add ..." text, including fetch
 * lands ("search your library for a Forest or Plains card") and "any color" sources.
 * "C" means colourless.
 */
export function producedColors(card: DeckCardInput, identity: string): Set<Color | "C"> {
  const out = new Set<Color | "C">();
  const inId = (c: Color) => identity.includes(c);
  if (card.producedMana?.length) {
    for (const m of card.producedMana) {
      if (m === "C") out.add("C");
      else if ((COLORS as readonly string[]).includes(m) && inId(m as Color)) out.add(m as Color);
    }
    return out;
  }
  const type = frontType(card);
  for (const [re, c] of LAND_TYPE_COLORS) if (re.test(type) && inId(c)) out.add(c);
  // Keep reminder text: a basic's only text is "({T}: Add {G}.)".
  const text = rulesText(card, { keepReminder: true });
  for (const m of text.matchAll(/\badd ((?:\{[^}]+\}(?:,? (?:or|and)? ?)?)+)/g)) {
    for (const sym of m[1].matchAll(/\{([^}]+)\}/g)) {
      const s = sym[1].toUpperCase();
      if (s === "C") out.add("C");
      else if ((COLORS as readonly string[]).includes(s) && inId(s as Color)) out.add(s as Color);
    }
  }
  if (/\bmana of any (?:one )?(?:color|type)\b|\bmana of any color\b|\bany color\b/.test(text)) for (const c of COLORS) if (inId(c)) out.add(c);
  // Fetches: "Search your library for a Forest or Plains card", "a basic land card" (any basic in identity).
  for (const m of text.matchAll(/\bsearch your library for (?:a|an|up to \w+) ([^.]*?)cards?\b[^.]*\bonto the battlefield/g)) {
    const what = m[1];
    if (/\bbasic land\b/.test(what) || /^land\b/.test(what)) for (const c of COLORS) if (inId(c)) out.add(c);
    for (const [re, c] of LAND_TYPE_COLORS) if (re.test(what.replace(/\b\w/g, (x) => x.toUpperCase())) && inId(c)) out.add(c);
  }
  return out;
}

function curveOf(main: DeckEntry[]): CurveBucket[] {
  const buckets: CurveBucket[] = Array.from({ length: 8 }, (_, i) => ({ manaValue: i, count: 0, permanents: 0, spells: 0 }));
  for (const e of main) {
    if (isLand(e.card)) continue;
    const b = buckets[Math.min(7, Math.max(0, Math.floor(e.card.cmc)))];
    b.count += e.quantity;
    if (/\b(?:Instant|Sorcery)\b/.test(frontType(e.card))) b.spells += e.quantity;
    else b.permanents += e.quantity;
  }
  return buckets;
}

/**
 * Frank Karsten's land-count formula for 99-card Commander decks:
 * lands = 31.42 + 3.13 × average mana value − 0.28 × cheap (mana value ≤ 2) ramp and card draw.
 * Clamped to 31–42; treat it as a starting point, not a rule.
 */
export function recommendedLands(averageManaValue: number, cheapRampAndDraw: number): number {
  const raw = 31.42 + 3.13 * averageManaValue - 0.28 * cheapRampAndDraw;
  return Math.min(42, Math.max(31, Math.round(raw)));
}

export function deckStats(entries: readonly DeckEntry[], opts: { prices?: boolean; multiplayer?: boolean } = {}): DeckStats {
  const commanders = entries.filter((e) => e.board === "commander");
  const main = entries.filter((e) => (e.board ?? "main") === "main");
  const deck = [...commanders, ...main];
  const identity = colorString(commanders.flatMap((e) => e.card.colorIdentity.split("")));
  const qty = (list: DeckEntry[], f: (c: DeckCardInput) => boolean) => list.reduce((n, e) => n + (f(e.card) ? e.quantity : 0), 0);

  const lands = qty(main, isLand);
  const mdfcLands = qty(main, isMdfcLand);
  const nonlandMain = main.filter((e) => !isLand(e.card));
  const nonlands = qty(main, (c) => !isLand(c));
  const mvSum = nonlandMain.reduce((n, e) => n + e.card.cmc * e.quantity, 0);
  const mainCount = qty(main, () => true);
  const averageManaValue = nonlands ? mvSum / nonlands : 0;

  const types = Object.fromEntries(CARD_TYPES.map((t) => [t, 0])) as Record<CardType, number>;
  for (const e of main) {
    const t = frontType(e.card);
    for (const ct of CARD_TYPES) if (new RegExp(`\\b${ct}\\b`).test(t)) types[ct] += e.quantity;
  }

  // Roles (main deck; commanders' own text is a separate thing).
  const roles = Object.fromEntries(ROLES.map((r) => [r, 0])) as Record<Role, number>;
  let cheapRampAndDraw = 0;
  for (const e of main) {
    const r = cardRoles(e.card);
    for (const role of r) roles[role] += e.quantity;
    if (!isLand(e.card) && e.card.cmc <= 2 && (r.includes("ramp") || r.includes("draw"))) cheapRampAndDraw += e.quantity;
  }
  const checklist: RoleLine[] = (Object.entries(ROLE_TARGETS) as [Role, { min: number; target: number }][]).map(([role, t]) => {
    const count = role === "land" ? lands : roles[role];
    return { role, count, min: t.min, target: t.target, status: count < t.min ? "low" : "ok" };
  });

  // Colour: pips and sources.
  const library = commanderLibrary(Math.max(1, qty(commanders, () => true)));
  const landSources: Record<Color | "C", number> = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
  const otherSources: Record<Color | "C", number> = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
  for (const e of main) {
    const produced = producedColors(e.card, identity);
    if (isLand(e.card)) for (const c of produced) landSources[c] += e.quantity;
    else if (cardRoles(e.card).includes("ramp") && !/\btreasure\b/i.test(e.card.oracleText)) for (const c of produced) otherSources[c] += e.quantity;
    if (isMdfcLand(e.card)) {
      const back = e.card.cardFaces?.slice(1).find((f) => /\bLand\b/.test(f.typeLine ?? ""));
      if (back) for (const c of producedColors({ ...e.card, name: back.name, typeLine: back.typeLine ?? "", oracleText: back.oracleText ?? "", cardFaces: null, producedMana: null }, identity)) landSources[c] += e.quantity;
    }
  }
  const pips: Record<Color, number> = { W: 0, U: 0, B: 0, R: 0, G: 0 };
  const seenBy = (turn: number) => cardsSeen(turn, { multiplayer: opts.multiplayer ?? true });
  const hardest = new Map<Color, NonNullable<ColorStat["hardest"]>>();
  for (const e of deck) {
    if (isLand(e.card)) continue;
    const costs = e.card.cardFaces?.length && e.card.layout !== "split" && e.card.layout !== "flip" && e.card.layout !== "adventure"
      ? [e.card.cardFaces[0].manaCost ?? e.card.manaCost]
      : [e.card.manaCost];
    const p = pipCounts(costs.join(""));
    for (const c of COLORS) {
      pips[c] += p[c] * e.quantity;
      // Commanders are cast from the command zone whenever you have the mana, so they aren't "drawn on curve".
      if (p[c] >= 1 && e.board !== "commander") {
        // The hardest card is the one least likely to have its coloured sources by the turn its mana value says.
        const mv = Math.max(1, Math.floor(e.card.cmc));
        const need = Math.ceil(p[c]);
        const chance = round(atLeast(library, landSources[c], seenBy(mv), need), 3);
        const cur = hardest.get(c);
        if (!cur || chance < cur.chanceOnCurve) hardest.set(c, { name: e.card.name, pips: need, manaValue: mv, chanceOnCurve: chance });
      }
    }
  }
  const pipTotal = COLORS.reduce((n, c) => n + pips[c], 0);
  const colors: ColorStat[] = COLORS.filter((c) => identity.includes(c) || pips[c] > 0).map((c) => {
    return {
      color: c,
      pips: round(pips[c], 1),
      pipShare: pipTotal ? round(pips[c] / pipTotal) : 0,
      landSources: landSources[c],
      otherSources: otherSources[c],
      hardest: hardest.get(c),
    };
  });

  // Land advice.
  const effectiveLands = lands + mdfcLands / 2;
  const recommended = recommendedLands(averageManaValue, cheapRampAndDraw);
  const delta = round(recommended - effectiveLands, 1);
  const mdfcNote = mdfcLands ? ` (plus ${mdfcLands} spell${mdfcLands === 1 ? "" : "s"} with a land back)` : "";
  const summary =
    Math.abs(delta) <= 1
      ? `${lands} lands${mdfcNote} looks right for this curve.`
      : delta > 0
        ? `${lands} lands${mdfcNote} is light for an average mana value of ${round(averageManaValue, 2)}. About ${recommended} is typical; consider adding ${Math.round(delta)}.`
        : `${lands} lands${mdfcNote} is more than this curve needs. About ${recommended} is typical; you could cut ${Math.round(-delta)}.`;

  let price: DeckStats["price"];
  if (opts.prices) {
    const unpriced: string[] = [];
    let totalUsd = 0;
    for (const e of deck) {
      if (e.card.priceUsd == null) {
        if (!/\bBasic\b/.test(frontType(e.card))) unpriced.push(e.card.name);
      } else totalUsd += e.card.priceUsd * e.quantity;
    }
    price = { totalUsd: round(totalUsd), unpriced };
  }

  return {
    totalCards: qty(deck, () => true),
    commanders: commanders.map((e) => e.card.name),
    colorIdentity: identity,
    lands,
    mdfcLands,
    nonlands,
    curve: curveOf(main),
    averageManaValue: round(averageManaValue),
    averageManaValueWithLands: mainCount ? round(mvSum / mainCount) : 0,
    types,
    colors,
    colorlessSources: landSources.C,
    landAdvice: { lands, mdfcLands, effectiveLands, recommended, delta, cheapRampAndDraw, averageManaValue: round(averageManaValue), summary },
    roles,
    checklist,
    gameChangers: [...new Set(deck.filter((e) => e.card.gameChanger).map((e) => e.card.name))],
    price,
    openingHandLands: openingHandLands(library, lands).map((p) => round(p, 4)),
  };
}
