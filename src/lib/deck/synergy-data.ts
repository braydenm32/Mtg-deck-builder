/**
 * The synergy check's data from outside the deck (the pure part is synergy.ts):
 * - EDHREC's synergy for the deck's cards with its commander, from the cached pages only, so the
 *   deck page never waits on EDHREC (a missing page is fetched after the response, for next time);
 * - cards to add that fit the deck's mechanics: cards you own first, then cards to buy or proxy.
 *   Looked up when the Synergy tab asks (GET /api/decks/:id/synergy), never on page load.
 *
 * Reads stay narrow for the hosted database's free plan: your collection's cards (a join on the
 * collection, the same rows the deck builder reads), and cards EDHREC or Commander Spellbook name, by
 * their indexed normalised name. It never scans the whole card table.
 */
import { and, eq, inArray, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { cards, collectionItems } from "@/db/schema";
import { identityWithin, normName } from "@/lib/cards/normalize";
import { NON_DECK_LAYOUTS } from "@/lib/cards/rows";
import { commanderSlug, edhrecCached, edhrecEnabled, parseCommanderPage, parseTagPage, type EdhrecCard } from "@/lib/edhrec/client";
import { deckCombos } from "@/lib/spellbook/client";
import { GAME_CHANGER_LIMIT, isExtraTurn, isMassLandDenial } from "./bracket";
import type { Combo } from "./combos";
import { deckEntries } from "./entries";
import { targetBracketOf } from "./status";
import { deckEdhrec, getDeck, mergeEdhrecPages, placements } from "./store";
import { synergyContext, type SynergyReport } from "./synergy";
import { themeParts } from "./themes";
import { isBasicLand } from "./text";
import type { DeckCardInput } from "./types";

type DeckLike = NonNullable<Awaited<ReturnType<typeof getDeck>>>;

/** EDHREC synergy by normalised card name, from the commander's cached pages (its theme pages for a themed deck). */
export async function cachedEdhrecSynergy(db: Db, v: Pick<DeckLike, "deck" | "commanders" | "cards">): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  // What the builder kept on the deck's rows (EDHREC's synergy when it picked the card).
  for (const c of v.cards) if (c.synergy !== null && c.synergy !== undefined) out.set(normName(c.name), c.synergy);
  if (!edhrecEnabled() || !v.commanders.length) return out;
  const slug = commanderSlug(v.commanders[0].name, v.commanders[1]?.name);
  const parts = themeParts(v.deck.theme);
  const paths = parts.length ? parts.map((t) => `commanders/${slug}/${t}`) : [`commanders/${slug}`];
  const pages = (await Promise.all(paths.map((p) => edhrecCached(db, p).catch(() => undefined))))
    .map((raw) => parseCommanderPage(raw))
    .filter((p): p is NonNullable<typeof p> => !!p?.cards.length);
  // A theme page EDHREC doesn't have: fall back to the commander's main page.
  if (!pages.length && parts.length) {
    const main = parseCommanderPage(await edhrecCached(db, `commanders/${slug}`).catch(() => undefined));
    if (main?.cards.length) pages.push(main);
  }
  if (!pages.length) return out;
  for (const c of mergeEdhrecPages(pages).cards) out.set(normName(c.name), c.synergy);
  return out;
}

const lookup = (m: Map<string, number>) => (name: string) => m.get(normName(name)) ?? m.get(normName(name.split(" // ")[0]));

/** The deck's synergy report, for the Synergy tab and the Overview's panel. */
export async function synergyReport(db: Db, v: DeckLike, combos: readonly Combo[]): Promise<SynergyReport> {
  const edh = await cachedEdhrecSynergy(db, v);
  return synergyContext(deckEntries(v), { theme: v.deck.theme, edhrec: edh.size ? lookup(edh) : undefined, combos }).report;
}

export type SynergySuggestion = {
  oracleId: string;
  name: string;
  imageSmall: string | null;
  imageNormal: string | null;
  typeLine: string;
  score: number;
  reason: string;
  /** The deck mechanics it fits, best first. */
  mechanics: string[];
  owned: boolean;
  /** Copies you own that no other deck is using. */
  free: number;
  /** Decks using your copies, when none is free. */
  inDecks: string[];
  priceUsd: number | null;
  /** The deck's weakest card for its mechanics that this one could replace. */
  replaces?: { name: string; score: number };
};

export type SynergySuggestions = { owned: SynergySuggestion[]; toGet: SynergySuggestion[]; edhrec: boolean };

/** Only what the synergy check reads. */
const COLUMNS = {
  oracleId: cards.oracleId,
  name: cards.name,
  normName: cards.normName,
  normFrontName: cards.normFrontName,
  manaCost: cards.manaCost,
  cmc: cards.cmc,
  typeLine: cards.typeLine,
  oracleText: cards.oracleText,
  colorIdentity: cards.colorIdentity,
  keywords: cards.keywords,
  layout: cards.layout,
  legalCommander: cards.legalCommander,
  gameChanger: cards.gameChanger,
  cardFaces: cards.cardFaces,
  imageSmall: cards.imageSmall,
  imageNormal: cards.imageNormal,
  priceUsd: cards.priceUsd,
  edhrecRank: cards.edhrecRank,
};
type Row = { [K in keyof typeof COLUMNS]: (typeof cards.$inferSelect)[K] };

/** Suggestions per list (owned, to get). */
export const SUGGESTIONS = 15;
/** A suggestion needs at least this score. */
const MIN_SCORE = 30;

/**
 * Cards that fit the deck's mechanics: up to 15 you own (free copies first among equals), then up to
 * 15 to buy or proxy, best first, inside the deck's target bracket. Each says which mechanic it fits,
 * why, and the deck's weakest card it could replace.
 */
export async function synergySuggestions(db: Db, deckId: number, opts: { limit?: number } = {}): Promise<SynergySuggestions | undefined> {
  const v = await getDeck(db, deckId);
  if (!v) return undefined;
  const limit = opts.limit ?? SUGGESTIONS;
  const entries = deckEntries(v);
  const [found, edhPage] = await Promise.all([
    deckCombos(db, entries, { deckId }).catch(() => undefined),
    v.commanders.length ? deckEdhrec(db, v.commanders[0].name, v.commanders[1]?.name, v.deck.theme) : Promise.resolve(undefined),
  ]);
  const edh = await cachedEdhrecSynergy(db, v);
  for (const c of edhPage?.cards ?? []) if (!edh.has(normName(c.name))) edh.set(normName(c.name), c.synergy);
  const ctx = synergyContext(entries, { theme: v.deck.theme, edhrec: edh.size ? lookup(edh) : undefined, combos: found?.combos ?? [] });
  const identity = v.deck.colorIdentity;
  const inDeck = new Set([...v.commanders.map((c) => c.oracleId), ...v.cards.filter((c) => c.board === "main").map((c) => c.oracleId)]);

  // Cards you own (one row per card).
  const ownedRows = await db
    .select({ ...COLUMNS, quantity: sql<number>`SUM(${collectionItems.quantity})` })
    .from(collectionItems)
    .innerJoin(cards, eq(cards.oracleId, collectionItems.oracleId))
    .where(eq(cards.legalCommander, "legal"))
    .groupBy(cards.oracleId);
  const owned = new Map(ownedRows.map((r) => [r.oracleId, { ...r, quantity: Number(r.quantity) }]));

  // Cards to get: what EDHREC plays with this commander and in the deck's main mechanics, and the
  // pieces that would finish a combo.
  const names = new Map<string, EdhrecCard | undefined>();
  for (const c of edhPage?.cards ?? []) names.set(normName(c.name), c);
  if (edhrecEnabled()) {
    for (const m of ctx.report.mechanics.slice(0, 2)) {
      const tag = parseTagPage(await edhrecCached(db, `tags/${m.slug}`).catch(() => undefined));
      for (const c of tag?.cards ?? []) if (!names.has(normName(c.name))) names.set(normName(c.name), undefined);
    }
  }
  const comboFor = new Map<string, Combo>();
  for (const n of found?.near ?? []) {
    names.set(normName(n.missing), names.get(normName(n.missing)));
    if (!comboFor.has(normName(n.missing))) comboFor.set(normName(n.missing), n.combo);
  }
  const wanted = [...names.keys()].filter((n) => n);
  const otherRows: Row[] = [];
  for (let i = 0; i < wanted.length; i += 300) {
    const chunk = wanted.slice(i, i + 300);
    otherRows.push(...(await db.select(COLUMNS).from(cards).where(and(inArray(cards.normName, chunk), eq(cards.legalCommander, "legal")))));
  }

  // The deck's bracket rules: Game Changers past the limit, mass land denial and extra turns below Bracket 4.
  const bracket = targetBracketOf(v.deck.settings);
  const gameChangers = [...v.commanders, ...v.cards.filter((c) => c.board === "main")].filter((c) => c.gameChanger).length;
  const gcRoom = Math.max(0, GAME_CHANGER_LIMIT[bracket] - gameChangers);
  const allowed = (r: Row) => {
    const card = asInput(r);
    if (inDeck.has(r.oracleId) || isBasicLand(card) || !identityWithin(r.colorIdentity, identity)) return false;
    if ((r.layout && NON_DECK_LAYOUTS.includes(r.layout)) || /^(Token|Card|Emblem)\b/.test(r.typeLine)) return false;
    if (r.gameChanger && gcRoom <= 0) return false;
    if (bracket < 4 && (isMassLandDenial(card) || isExtraTurn(card))) return false;
    return true;
  };
  const { byCard } = await placements(db, { excludeDeckId: deckId });

  const rate = (r: Row) => {
    const verdict = ctx.rate(asInput(r), { completesCombo: comboFor.get(r.normName) ?? comboFor.get(r.normFrontName ?? "") });
    return { r, verdict };
  };
  const fits = (x: ReturnType<typeof rate>) => x.verdict.score >= MIN_SCORE && (x.verdict.mechanics.length > 0 || x.verdict.combo);
  const byScore = (a: { verdict: { score: number } }, b: { verdict: { score: number } }) => b.verdict.score - a.verdict.score;

  const ownedList = [...owned.values()].filter(allowed).map(rate).filter(fits);
  const free = (o: string) => Math.max(0, (owned.get(o)?.quantity ?? 0) - (byCard.get(o)?.copies ?? 0));
  // Free copies first among cards that score about the same.
  ownedList.sort((a, b) => b.verdict.score + (free(b.r.oracleId) > 0 ? 5 : 0) - (a.verdict.score + (free(a.r.oracleId) > 0 ? 5 : 0)));
  const toGetList = otherRows
    .filter((r) => !owned.has(r.oracleId) && allowed(r))
    .map(rate)
    .filter(fits)
    .sort(byScore);
  // At most the Game Changers the bracket still has room for, in each list.
  const capGc = <T extends { r: Row }>(xs: T[]) => {
    let room = gcRoom;
    return xs.filter((x) => !x.r.gameChanger || room-- > 0);
  };

  // What each could replace: the deck's cut candidates, weakest first, one per suggestion.
  const cuts = ctx.report.cards.filter((c) => c.cut).sort((a, b) => a.score - b.score);
  const used = new Set<string>();
  const replacing = (score: number, land: boolean) => {
    if (land) return undefined;
    const c = cuts.find((x) => !used.has(x.name) && x.score <= score - 20);
    if (c) used.add(c.name);
    return c ? { name: c.name, score: c.score } : undefined;
  };
  const shape = ({ r, verdict }: ReturnType<typeof rate>, isOwned: boolean): SynergySuggestion => ({
    oracleId: r.oracleId,
    name: r.name,
    imageSmall: r.imageSmall,
    imageNormal: r.imageNormal,
    typeLine: r.typeLine,
    score: verdict.score,
    reason: verdict.reason,
    mechanics: verdict.mechanicLabels,
    owned: isOwned,
    free: isOwned ? free(r.oracleId) : 0,
    inDecks: isOwned && free(r.oracleId) === 0 ? (byCard.get(r.oracleId)?.decks.map((d) => d.name) ?? []) : [],
    priceUsd: r.priceUsd,
    ...(() => {
      const rep = replacing(verdict.score, verdict.land);
      return rep ? { replaces: rep } : {};
    })(),
  });
  const ownedOut = capGc(ownedList).slice(0, limit).map((x) => shape(x, true));
  const toGetOut = capGc(toGetList).slice(0, limit).map((x) => shape(x, false));
  return { owned: ownedOut, toGet: toGetOut, edhrec: !!edhPage?.cards.length };
}

function asInput(r: Row): DeckCardInput & { oracleId: string } {
  return {
    oracleId: r.oracleId,
    name: r.name,
    manaCost: r.manaCost,
    cmc: r.cmc ?? 0,
    typeLine: r.typeLine,
    oracleText: r.oracleText ?? "",
    colorIdentity: r.colorIdentity,
    keywords: r.keywords ?? [],
    layout: r.layout ?? "normal",
    legalCommander: r.legalCommander ?? undefined,
    gameChanger: r.gameChanger ?? false,
    cardFaces: r.cardFaces ?? null,
    priceUsd: r.priceUsd,
    edhrecRank: r.edhrecRank,
  };
}
