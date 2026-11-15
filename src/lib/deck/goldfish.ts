/**
 * Sample hands and goldfish simulation: how a deck's opening hands and first turns tend to go,
 * with no opponent. Seeded, so the same seed gives the same shuffle (useful for the "new hand"
 * button and for tests).
 *
 * Mulligans follow Commander rules: London mulligan (draw 7, bottom one card per mulligan), and in
 * multiplayer the first mulligan is free (Comprehensive Rules 103.5c).
 *
 * The play model is deliberately simple: play a land each turn if you have one, then cast ramp you can
 * afford (cheapest first). Each ramp permanent or land-fetch spell adds one mana from the next turn
 * (Sol Ring and other "{C}{C}" rocks add two). Treasure makers, rituals and draw spells aren't modelled.
 */
import { cardRoles } from "./roles";
import { frontType, isLand, rulesText } from "./text";
import type { DeckCardInput, DeckEntry } from "./types";

const rampCache = new WeakMap<DeckCardInput, boolean>();
const landCache = new WeakMap<DeckCardInput, boolean>();
/** Cached per card object: the simulation asks the same questions thousands of times. */
function isRampCard(c: DeckCardInput): boolean {
  let v = rampCache.get(c);
  if (v === undefined) rampCache.set(c, (v = !isLandCard(c) && cardRoles(c).includes("ramp")));
  return v;
}
function isLandCard(c: DeckCardInput): boolean {
  let v = landCache.get(c);
  if (v === undefined) landCache.set(c, (v = isLand(c)));
  return v;
}

/** Mulberry32: tiny, fast, good enough for shuffles. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle<T>(items: readonly T[], random: () => number): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** The 99 (or 98), one array element per physical card. */
export function libraryCards<C extends DeckCardInput>(entries: readonly DeckEntry<C>[]): C[] {
  return entries.filter((e) => (e.board ?? "main") === "main").flatMap((e) => Array.from({ length: e.quantity }, () => e.card));
}

/** A shuffled library for the sample-hand screen: the first 7 are the hand, the rest are the draws. */
export function shuffledLibrary<C extends DeckCardInput>(entries: readonly DeckEntry<C>[], seed: number): C[] {
  return shuffle(libraryCards(entries), rng(seed));
}

export type KeepRule = (hand: readonly DeckCardInput[], mulligansTaken: number) => boolean;

/** Default keep rule: 2 to 5 lands in a 7-card hand; after a mulligan, accept 2 to 5 too (or anything at 3+ mulligans). */
export const defaultKeep: KeepRule = (hand, mulligansTaken) => {
  if (mulligansTaken >= 3) return true;
  const lands = hand.filter(isLandCard).length;
  const ramp = hand.filter((c) => c.cmc <= 2 && isRampCard(c)).length;
  return (lands >= 2 && lands <= 5) || (lands === 1 && ramp >= 2 && mulligansTaken >= 1);
};

/**
 * Which cards to put on the bottom after a London mulligan: keep lands near 3-4 and keep cheap
 * spells, so bottom the most expensive spells first, or extra lands beyond 4.
 */
export function chooseBottom(hand: readonly DeckCardInput[], count: number): DeckCardInput[] {
  const bottom: DeckCardInput[] = [];
  const rest = [...hand];
  for (let i = 0; i < count; i++) {
    const lands = rest.filter(isLandCard);
    const spells = rest.filter((c) => !isLandCard(c)).sort((a, b) => b.cmc - a.cmc);
    const pick = lands.length > 4 || spells.length === 0 ? lands[lands.length - 1] : spells[0];
    bottom.push(pick);
    rest.splice(rest.indexOf(pick), 1);
  }
  return bottom;
}

export type OpeningHand<C extends DeckCardInput = DeckCardInput> = {
  hand: C[];
  library: C[];
  mulligans: number;
  bottomed: C[];
};

/** Draw an opening hand with mulligans. `freeMulligan` defaults to true (multiplayer). */
export function openingHand<C extends DeckCardInput>(
  library: readonly C[],
  random: () => number,
  opts: { keep?: KeepRule; freeMulligan?: boolean; maxMulligans?: number } = {},
): OpeningHand<C> {
  const keep = opts.keep ?? defaultKeep;
  const free = opts.freeMulligan ?? true;
  const max = opts.maxMulligans ?? 6;
  let mulligans = 0;
  for (;;) {
    const deck = shuffle(library, random);
    const seven = deck.slice(0, 7);
    const toBottom = Math.max(0, mulligans - (free ? 1 : 0));
    if (keep(seven, mulligans) || mulligans >= max) {
      const bottomed = chooseBottom(seven, Math.min(7, toBottom)) as C[];
      const hand = [...seven];
      for (const b of bottomed) hand.splice(hand.indexOf(b), 1);
      return { hand, library: [...deck.slice(7), ...bottomed], mulligans, bottomed };
    }
    mulligans++;
  }
}

/** Mana a ramp card adds once it resolves (1 for most; 2 for "Add {C}{C}" rocks; 0 for one-shot rituals). */
function rampValue(card: DeckCardInput): number {
  if (/\b(?:Instant|Sorcery)\b/.test(frontType(card))) {
    const t = rulesText(card);
    // Land-fetch spells (Cultivate, Rampant Growth) put a land onto the battlefield: +1 from then on.
    return /\bsearch your library\b[^.]*\bland\b[^.]*\bonto the battlefield\b/.test(t) ? 1 : 0;
  }
  if (/\badd \{c\}\{c\}\b/.test(rulesText(card))) return 2;
  return 1;
}

export type GoldfishResult = {
  games: number;
  /** Share of games that took at least one mulligan, and the average number taken. */
  mulliganRate: number;
  averageMulligans: number;
  averageLandsInOpeningHand: number;
  /** By turn t (index = t, 1-based; index 0 unused): share of games that had made every land drop so far. */
  landDropsHit: number[];
  /** By turn t: average mana available (lands + ramp). */
  averageMana: number[];
  /** When the commander(s) could first be cast: share of games by each turn, and the median turn. */
  commanderOnTurn?: { manaValue: number; byTurn: number[]; medianTurn: number | null };
};

/** Simulate `games` goldfish games for `turns` turns. */
export function goldfish(entries: readonly DeckEntry[], opts: { games?: number; turns?: number; seed?: number; keep?: KeepRule; multiplayer?: boolean } = {}): GoldfishResult {
  const games = opts.games ?? 2000;
  const turns = opts.turns ?? 8;
  const random = rng(opts.seed ?? 1);
  const library = libraryCards(entries);
  const commanderMv = entries.filter((e) => e.board === "commander").reduce((m, e) => Math.min(m, e.card.cmc), Infinity);
  const multiplayer = opts.multiplayer ?? true;

  let mulled = 0;
  let mulliganTotal = 0;
  let openingLands = 0;
  const hitAll = new Array(turns + 1).fill(0);
  const manaSum = new Array(turns + 1).fill(0);
  const commanderBy = new Array(turns + 1).fill(0);
  const firstCast: number[] = [];

  for (let g = 0; g < games; g++) {
    const o = openingHand(library, random, { keep: opts.keep, freeMulligan: multiplayer });
    if (o.mulligans > 0) mulled++;
    mulliganTotal += o.mulligans;
    openingLands += o.hand.filter(isLandCard).length;
    const hand = [...o.hand];
    const lib = [...o.library];
    let landsInPlay = 0;
    let ramp = 0;
    let missed = false;
    let cast: number | null = null;
    for (let t = 1; t <= turns; t++) {
      if (multiplayer || t > 1) {
        const c = lib.shift();
        if (c) hand.push(c);
      }
      const landIdx = hand.findIndex(isLandCard);
      if (landIdx >= 0) {
        hand.splice(landIdx, 1);
        landsInPlay++;
      } else missed = true;
      if (!missed) hitAll[t]++;
      let available = landsInPlay + ramp;
      manaSum[t] += available;
      if (cast === null && Number.isFinite(commanderMv) && available >= commanderMv) cast = t;
      // Cast ramp, cheapest first, with what's left after the commander would be cast this turn.
      const rampCards = hand.filter(isRampCard).sort((a, b) => a.cmc - b.cmc);
      for (const r of rampCards) {
        if (r.cmc > available) break;
        available -= r.cmc;
        ramp += rampValue(r);
        hand.splice(hand.indexOf(r), 1);
      }
    }
    if (cast !== null) {
      firstCast.push(cast);
      for (let t = cast; t <= turns; t++) commanderBy[t]++;
    }
  }

  const share = (n: number) => Math.round((n / games) * 1000) / 1000;
  firstCast.sort((a, b) => a - b);
  return {
    games,
    mulliganRate: share(mulled),
    averageMulligans: Math.round((mulliganTotal / games) * 100) / 100,
    averageLandsInOpeningHand: Math.round((openingLands / games) * 100) / 100,
    landDropsHit: hitAll.map(share),
    averageMana: manaSum.map((m) => Math.round((m / games) * 100) / 100),
    commanderOnTurn: Number.isFinite(commanderMv)
      ? {
          manaValue: commanderMv,
          byTurn: commanderBy.map(share),
          medianTurn: firstCast.length >= games / 2 ? firstCast[Math.floor(games / 2)] : null,
        }
      : undefined,
  };
}
