/**
 * The synergy check: how well a deck's cards work with each other (Brayden, 2026-11-18).
 *
 * - The deck's mechanics (mechanics.ts) are found from its cards: each card can make what a mechanic
 *   counts (an enabler) or reward it (a payoff). A mechanic counts when the deck has enough of both,
 *   and the deck's chosen theme always counts. The commander counts three times.
 * - Each card scores 0..100: how well it links to the deck's mechanics (a payoff is as good as the
 *   enablers around it, and the other way round), whether it works with the commander, EDHREC's
 *   synergy for it with this commander, and whether it's part of a combo in the deck.
 * - Ramp, draw, removal and the like are staples: they keep the deck running without playing into a
 *   mechanic, so they're never marked to cut for it. Lands are ranked too (a utility land can play
 *   into a mechanic); basics are counted, not ranked.
 * - The deck scores 0..100: how much of it plays into its mechanics, whether the main mechanics have
 *   both sides (enough enablers and payoffs), how much of it works with the commander, and combos.
 *
 * Pure: the deck page and the suggestions (synergy-suggest.ts) pass in what they know.
 */
import type { Combo } from "./combos";
import { cardFacts, creatureTypes, MECHANICS, mechanicForSlug, typalMechanic, type CardFacts, type MechanicDef, type MechanicSide } from "./mechanics";
import { cardRoles, ROLE_LABELS, type Role } from "./roles";
import { themeLabel, themeParts, themeScore, typalType } from "./themes";
import { isBasicLand, isLand } from "./text";
import type { DeckCardInput, DeckEntry } from "./types";

export type DeckMechanic = {
  id: string;
  label: string;
  /** EDHREC theme slug for it, to look for more cards. */
  slug: string;
  /** Cards that make what it counts, and cards that reward it (a card can be both). */
  enablers: number;
  payoffs: number;
  /** The cards in it, strongest first (the commander first when it plays the mechanic). */
  cards: string[];
  /** The commander plays it. */
  commander: boolean;
  /** It's (part of) the deck's chosen theme. */
  theme: boolean;
  /** 0..1: how much it shapes the deck, the top mechanic 1. */
  weight: number;
};

export type CardVerdict = {
  name: string;
  oracleId?: string;
  /** 0..100. */
  score: number;
  land: boolean;
  /** The deck mechanics it plays into, best first. */
  mechanics: string[];
  commanderTie: boolean;
  combo: boolean;
  /** EDHREC synergy with this commander (-1..1), when known. */
  edhrec?: number;
  /** For ramp, draw, removal and the like: the job that keeps it in the deck anyway. */
  staple?: string;
  /** One of the weakest cards for the deck's mechanics: a candidate to cut. */
  cut: boolean;
  reason: string;
};

export type SynergyReport = {
  score: number;
  label: string;
  summary: string;
  /** The score's parts, each 0..100, and how many combos added to it. */
  parts: { fit: number; engines: number; commander: number; combos: number };
  mechanics: DeckMechanic[];
  /** Spells, best first. */
  cards: CardVerdict[];
  /** Nonbasic lands, best first. */
  lands: CardVerdict[];
  basics: number;
  hasEdhrec: boolean;
};

export type SynergyOptions = {
  /** The deck's theme value (one slug or a mix, "tokens+angels"). */
  theme?: string | null;
  /** EDHREC synergy (-1..1) for a card with this commander, by card name. */
  edhrec?: (name: string) => number | undefined;
  /** The combos in the deck (Commander Spellbook's, or the built-in list). */
  combos?: readonly Combo[];
};

/** How many times the commander counts toward a mechanic: it's always there. */
const COMMANDER_WEIGHT = 3;
/** At most this many mechanics are listed. */
const MAX_MECHANICS = 6;
/** The cut list. */
const MAX_CUTS = 8;
const CUT_BELOW = 35;
const STAPLE_ROLES: Role[] = ["ramp", "draw", "removal", "wipe", "counter", "protection", "tutor", "recursion"];

const sat = (x: number, k: number) => (x <= 0 ? 0 : 1 - Math.exp(-x / k));
const clamp = (x: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, x));
const shortName = (name: string) => name.split(" // ")[0].split(",")[0];
const sameName = (a: string, b: string) => a === b || a.split(" // ")[0] === b.split(" // ")[0];

type Profiled<C extends DeckCardInput> = { card: C; facts: CardFacts; sides: Map<string, MechanicSide>; commander: boolean; quantity: number };

type Totals = { enabler: number; payoff: number; enablerCards: number; payoffCards: number; cards: { name: string; strength: number; commander: boolean }[] };

/** The deck mechanics to look for: the built-in ones, the deck's common creature types, and its theme. */
function candidateMechanics(cards: Profiled<DeckCardInput>[], theme: string | null | undefined): { defs: MechanicDef[]; themeIds: Set<string> } {
  const defs = new Map<string, MechanicDef>(MECHANICS.map((m) => [m.id, m]));
  const themeIds = new Set<string>();
  for (const slug of themeParts(theme)) {
    const builtIn = mechanicForSlug(slug);
    const type = builtIn ? undefined : typalType(slug);
    const def: MechanicDef = builtIn ?? (type ? typalMechanic(type) : themeMechanic(slug));
    defs.set(def.id, def);
    themeIds.add(def.id);
  }
  // Creature types: common in the deck, or the commander's own type with a few others.
  const count = new Map<string, number>();
  const commanderTypes = new Set<string>();
  for (const p of cards) {
    if (!p.facts.creature || p.facts.keywords.includes("changeling")) continue;
    for (const t of creatureTypes(p.card)) {
      count.set(t, (count.get(t) ?? 0) + p.quantity);
      if (p.commander) commanderTypes.add(t);
    }
  }
  const mentioned = (t: string) => cards.some((p) => p.commander && new RegExp(`\\b${t.toLowerCase()}`).test(p.facts.text));
  const types = [...count.entries()]
    .filter(([t, n]) => n >= 8 || (n >= 4 && (commanderTypes.has(t) || mentioned(t))))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);
  for (const [t] of types) if (!defs.has(`typal:${t}`)) defs.set(`typal:${t}`, typalMechanic(t));
  return { defs: [...defs.values()], themeIds };
}

/** A theme the built-in mechanics don't cover (Flying, Dragons' Approach...): cards fit it by its rules-text match. */
function themeMechanic(slug: string): MechanicDef {
  return {
    id: `theme:${slug}`,
    label: themeLabel(slug),
    slugs: [slug],
    side: (f) => {
      const s = themeScore({ name: f.card.name, typeLine: f.card.typeLine, oracleText: f.card.oracleText, keywords: f.card.keywords }, slug);
      return { enabler: s, payoff: s >= 0.8 ? s : 0 };
    },
  };
}

function profile<C extends DeckCardInput>(card: C, defs: MechanicDef[], commander: boolean, quantity: number): Profiled<C> {
  const facts = cardFacts(card);
  const sides = new Map<string, MechanicSide>();
  for (const d of defs) {
    const s = d.side(facts);
    if (s.enabler > 0 || s.payoff > 0) sides.set(d.id, s);
  }
  return { card, facts, sides, commander, quantity };
}

/**
 * What the deck is about, for rating its cards and cards that could join it. `rate` scores any card
 * against the deck (as if it were in it), so suggestions use the same yardstick as the deck's cards.
 */
export type SynergyContext = {
  report: SynergyReport;
  rate: (card: DeckCardInput, extra?: { edhrec?: number; completesCombo?: Combo }) => Omit<CardVerdict, "cut"> & { mechanicLabels: string[] };
};

export function synergyContext<C extends DeckCardInput & { oracleId?: string }>(entries: readonly DeckEntry<C>[], opts: SynergyOptions = {}): SynergyContext {
  const deckEntries = entries.filter((e) => e.board === "commander" || e.board === "main" || e.board === undefined);
  const plain = deckEntries.map((e) => profile(e.card as DeckCardInput, [], e.board === "commander", e.quantity));
  const { defs, themeIds } = candidateMechanics(plain, opts.theme);
  const cards = deckEntries.map((e) => profile(e.card, defs, e.board === "commander", e.quantity));
  const commanders = cards.filter((c) => c.commander);
  const commanderName = commanders.map((c) => shortName(c.card.name)).join(" and ") || "your commander";
  const identity = [...new Set(commanders.flatMap((c) => [...c.card.colorIdentity]))].join("");

  // Each mechanic's totals over the deck.
  const totals = new Map<string, Totals>();
  for (const d of defs) totals.set(d.id, { enabler: 0, payoff: 0, enablerCards: 0, payoffCards: 0, cards: [] });
  for (const c of cards) {
    const w = c.commander ? COMMANDER_WEIGHT : c.quantity;
    for (const [id, s] of c.sides) {
      const t = totals.get(id)!;
      t.enabler += s.enabler * w;
      t.payoff += s.payoff * w;
      if (s.enabler > 0) t.enablerCards += 1;
      if (s.payoff > 0) t.payoffCards += 1;
      t.cards.push({ name: c.card.name, strength: Math.max(s.enabler, s.payoff), commander: c.commander });
    }
  }

  // Which mechanics the deck plays: both sides present (or its theme), ranked by how much of the deck they shape.
  const ranked = defs
    .map((d) => {
      const t = totals.get(d.id)!;
      const theme = themeIds.has(d.id);
      const commander = commanders.some((c) => c.sides.has(d.id));
      const prominence = Math.sqrt(t.enabler * Math.max(t.payoff, theme ? t.enabler * 0.3 : 0)) + (commander ? 2 : 0) + (theme ? 2 : 0);
      const enough = t.enabler >= (d.needs?.enablers ?? 3) && t.payoff >= (d.needs?.payoffs ?? 2) && t.cards.length >= 6 && Math.sqrt(t.enabler * t.payoff) >= 3;
      return { d, t, theme, commander, prominence, keep: theme ? t.cards.length > 0 : enough };
    })
    .filter((x) => x.keep)
    .sort((a, b) => Number(b.theme) - Number(a.theme) || b.prominence - a.prominence);
  const chosen = [...ranked.filter((x) => x.theme), ...ranked.filter((x) => !x.theme).slice(0, Math.max(0, MAX_MECHANICS - ranked.filter((x) => x.theme).length))].sort(
    (a, b) => b.prominence - a.prominence,
  );
  const top = Math.max(1, ...chosen.map((x) => x.prominence));
  const mechanics: DeckMechanic[] = chosen.map((x) => ({
    id: x.d.id,
    label: x.d.label,
    slug: x.d.slugs[0],
    enablers: x.t.enablerCards,
    payoffs: x.t.payoffCards,
    cards: [...x.t.cards].sort((a, b) => Number(b.commander) - Number(a.commander) || b.strength - a.strength || a.name.localeCompare(b.name)).map((c) => c.name),
    commander: x.commander,
    theme: x.theme,
    weight: Math.round((0.6 + 0.4 * (x.prominence / top)) * 100) / 100,
  }));
  const byId = new Map(mechanics.map((m) => [m.id, m]));
  const hasEdhrec = !!opts.edhrec && cards.some((c) => !c.commander && opts.edhrec!(c.card.name) !== undefined);
  const combos = opts.combos ?? [];

  /** How well a card links to one deck mechanic, leaving its own part out of the totals when it's in the deck. */
  function link(id: string, s: MechanicSide, own: number) {
    const t = totals.get(id)!;
    const enablersAround = t.enabler - s.enabler * own;
    const payoffsAround = t.payoff - s.payoff * own;
    const asPayoff = s.payoff * sat(enablersAround, 6);
    const asEnabler = s.enabler * sat(payoffsAround, 4);
    return { value: Math.max(asPayoff, 0.85 * asEnabler) + 0.15 * Math.min(asPayoff, asEnabler), payoff: asPayoff >= 0.85 * asEnabler, enablersAround, payoffsAround };
  }

  function rateProfiled(p: Profiled<DeckCardInput>, own: number, extra: { edhrec?: number; completesCombo?: Combo; inDeck: boolean }) {
    const links = [...p.sides.entries()]
      .filter(([id]) => byId.has(id))
      .map(([id, s]) => ({ id, ...link(id, s, own), weighted: link(id, s, own).value * byId.get(id)!.weight }))
      .filter((l) => l.value >= 0.15)
      .sort((a, b) => b.weighted - a.weighted);
    const mech = clamp((links[0]?.weighted ?? 0) + 0.35 * (links[1]?.weighted ?? 0));
    // Works with the commander: it makes what the commander rewards, or rewards what the commander makes.
    let tie = 0;
    for (const cmd of commanders) {
      if (cmd.card === p.card) continue;
      for (const [id, cs] of cmd.sides) {
        const s = p.sides.get(id);
        if (!s || !byId.has(id)) continue;
        tie = Math.max(tie, s.enabler * cs.payoff, s.payoff * cs.enabler, 0.5 * s.enabler * cs.enabler);
      }
    }
    const edh = extra.edhrec;
    const edhPart = edh === undefined ? 0 : clamp(edh / 0.35, -0.4, 1);
    const inCombo = extra.inDeck ? combos.find((c) => c.cards.some((n) => sameName(n, p.card.name))) : undefined;
    const combo = inCombo ?? extra.completesCombo;
    const raw = hasEdhrec ? 0.6 * mech + 0.22 * tie + 0.2 * edhPart + (combo ? 0.25 : 0) : 0.7 * mech + 0.25 * tie + (combo ? 0.25 : 0);
    const score = Math.round(clamp((1 - Math.exp(-1.9 * Math.max(0, raw))) / (1 - Math.exp(-1.9))) * 100);
    const land = isLand(p.card);
    const roles = land ? [] : cardRoles(p.card);
    const stapleRole = roles.find((r) => STAPLE_ROLES.includes(r));
    const staple = stapleRole && score < 60 ? ROLE_LABELS[stapleRole] : undefined;

    const parts: string[] = [];
    const [first, second] = links;
    if (first) {
      const m = byId.get(first.id)!;
      const s = p.sides.get(first.id)!;
      const around = first.payoff ? Math.round(totals.get(first.id)!.enablerCards - (s.enabler > 0 && own ? 1 : 0)) : Math.round(totals.get(first.id)!.payoffCards - (s.payoff > 0 && own ? 1 : 0));
      if (s.enabler >= 0.5 && s.payoff >= 0.5) parts.push(`${m.label} engine`);
      else if (first.payoff) parts.push(`Uses ${m.label}: ${around} ${around === 1 ? "card feeds" : "cards feed"} it`);
      else parts.push(`Feeds ${m.label}: ${around} ${around === 1 ? "card uses" : "cards use"} it`);
      if (second) parts.push(`also ${byId.get(second.id)!.label}`);
    }
    if (tie >= 0.4) parts.push(`works with ${commanderName}`);
    if (combo) {
      const others = combo.cards.filter((n) => !sameName(n, p.card.name)).map(shortName);
      parts.push(extra.inDeck ? `combo with ${others.join(" + ")}` : `finishes a combo with ${others.join(" + ")}`);
    }
    if (edh !== undefined && edh >= 0.1) parts.push(`EDHREC synergy +${Math.round(edh * 100)}%`);
    if (!parts.length) {
      if (land) parts.push(landMana(p, identity));
      else if (staple) parts.push(`${staple}: a staple, keep it`);
      else parts.push("Doesn’t use the deck’s mechanics");
    } else if (staple && !first) parts.push(`${staple.toLowerCase()}`);
    const reason = parts.join(" · ");
    return {
      name: p.card.name,
      oracleId: (p.card as { oracleId?: string }).oracleId,
      score,
      land,
      mechanics: links.map((l) => l.id),
      mechanicLabels: links.map((l) => byId.get(l.id)!.label),
      commanderTie: tie >= 0.4,
      combo: !!combo,
      ...(edh !== undefined ? { edhrec: edh } : {}),
      ...(staple ? { staple } : {}),
      reason: reason[0].toUpperCase() + reason.slice(1),
    };
  }

  // The deck's own cards.
  const verdicts: CardVerdict[] = [];
  let basics = 0;
  for (const p of cards) {
    if (p.commander) continue;
    if (isBasicLand(p.card)) {
      basics += p.quantity;
      continue;
    }
    const v: Partial<ReturnType<typeof rateProfiled>> = rateProfiled(p, p.quantity, { edhrec: opts.edhrec?.(p.card.name), inDeck: true });
    delete v.mechanicLabels;
    verdicts.push({ ...(v as Omit<ReturnType<typeof rateProfiled>, "mechanicLabels">), cut: false });
  }
  const order = (a: CardVerdict, b: CardVerdict) => b.score - a.score || a.name.localeCompare(b.name);
  const spells = verdicts.filter((v) => !v.land).sort(order);
  // Lands with no part in a mechanic: the ones that make more of your colours first.
  const colours = new Map(cards.filter((c) => c.facts.land).map((c) => [c.card.name, landColours(c, identity)]));
  const lands = verdicts.filter((v) => v.land).sort((a, b) => b.score - a.score || (colours.get(b.name) ?? 0) - (colours.get(a.name) ?? 0) || a.name.localeCompare(b.name));
  const cutList = spells
    .filter((v) => !v.staple && !v.combo && v.score < CUT_BELOW)
    .sort((a, b) => a.score - b.score || a.name.localeCompare(b.name))
    .slice(0, MAX_CUTS);
  for (const c of cutList) c.cut = true;

  // The deck's score.
  const qty = new Map(cards.map((c) => [c.card.name, c.quantity]));
  const n = spells.reduce((s, v) => s + (qty.get(v.name) ?? 1), 0);
  const fitAvg = n ? spells.reduce((s, v) => s + (v.staple ? Math.max(v.score, 40) : v.score) * (qty.get(v.name) ?? 1), 0) / n / 100 : 0;
  const fit = clamp((fitAvg - 0.25) / 0.45);
  const engineOf = (m: DeckMechanic | undefined) => {
    if (!m) return 0;
    const t = totals.get(m.id)!;
    return sat(t.enabler, 7) * sat(t.payoff, 4);
  };
  const [m1, m2, m3] = mechanics;
  const engines = clamp(0.55 * engineOf(m1) + 0.3 * engineOf(m2) + 0.15 * engineOf(m3));
  const tied = spells.filter((v) => v.commanderTie || (v.edhrec ?? 0) >= 0.2).length;
  const commander = clamp(n ? tied / n / 0.5 : 0);
  const comboCount = combos.length;
  const comboBonus = Math.min(6, 3 * comboCount);
  const score = Math.round(clamp(0.5 * fit + 0.3 * engines + 0.2 * commander) * 100 + comboBonus);
  const final = Math.max(0, Math.min(100, spells.length ? score : 0));
  const label = synergyLabel(final);
  const playing = spells.filter((v) => v.mechanics.length > 0).length;
  const names = mechanics.slice(0, 2).map((m) => m.label);
  const summary = !spells.length
    ? "Add some cards to see how they work together."
    : mechanics.length
      ? `${playing} of ${spells.length} spells play into ${names.join(" and ")}${mechanics.length > 2 ? " or another of its mechanics" : ""}.`
      : "No clear mechanic yet: the cards don’t share a plan.";

  const report: SynergyReport = {
    score: final,
    label,
    summary,
    parts: { fit: Math.round(fit * 100), engines: Math.round(engines * 100), commander: Math.round(commander * 100), combos: comboCount },
    mechanics,
    cards: spells,
    lands,
    basics,
    hasEdhrec,
  };

  return {
    report,
    rate: (card, extra = {}) => {
      const p = profile(card, defs, false, 1);
      return rateProfiled(p, 0, { edhrec: extra.edhrec ?? opts.edhrec?.(card.name), completesCombo: extra.completesCombo, inDeck: false });
    },
  };
}

/** How many of the deck's colours a land makes. */
function landColours(p: Profiled<DeckCardInput>, identity: string): number {
  const made = p.card.producedMana?.length ? p.card.producedMana.join("") : p.facts.text;
  if (/\bany colou?r\b|\bany type\b|\bcommander's colou?r identity\b/.test(p.facts.text)) return identity.length;
  return [...identity].filter((c) => (p.card.producedMana?.length ? made.includes(c) : made.includes(`{${c.toLowerCase()}}`))).length;
}

function landMana(p: Profiled<DeckCardInput>, identity: string): string {
  const n = landColours(p, identity);
  if (!identity.length || n === 0) return /\bsearch your library\b/.test(p.facts.text) ? "Finds a land" : "Makes mana";
  if (identity.length === 1) return "Makes your colour";
  return n === identity.length ? "Makes all your colours" : `Makes ${n} of your ${identity.length} colours`;
}

/** The deck's synergy report. */
export function deckSynergy<C extends DeckCardInput & { oracleId?: string }>(entries: readonly DeckEntry<C>[], opts: SynergyOptions = {}): SynergyReport {
  return synergyContext(entries, opts).report;
}

export function synergyLabel(score: number): string {
  if (score >= 85) return "Very strong synergy";
  if (score >= 70) return "Strong synergy";
  if (score >= 55) return "Good synergy";
  if (score >= 40) return "Some synergy";
  return "Little synergy";
}
