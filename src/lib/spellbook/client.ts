import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { edhrecCache } from "@/db/schema";
import { findCombos, KNOWN_TWO_CARD_COMBOS, nearCombos, type Combo } from "@/lib/deck/combos";
import type { DeckEntry } from "@/lib/deck/types";
import { USER_AGENT } from "@/lib/scryfall/client";
import { parseFindMyCombos, renameToDeck, type FindMyCombosPage, type SpellbookCombos } from "./parse";

/**
 * Commander Spellbook (commanderspellbook.com), the combo database behind EDHREC's combo pages.
 * Brayden approved using it on 2026-11-15. One "find my combos" request per deck list:
 * - only when a deck is opened or analysed, never crawled
 * - cached for 7 days in the shared HTTP cache table (keys "spellbook/..."), keyed by the deck's cards,
 *   so an unchanged deck never asks again
 * - at most one request per second, with a timeout
 * - SPELLBOOK_ENABLED=false turns it off; the built-in combo list is used instead
 */
const ENDPOINT = "https://backend.commanderspellbook.com/find-my-combos";
const PAGE_SIZE = 1000;
const MAX_PAGES = 3;
const TTL_MS = 7 * 24 * 3600 * 1000;
const GAP_MS = 1000;
const TIMEOUT_MS = 15_000;

export function spellbookEnabled(): boolean {
  return (process.env.SPELLBOOK_ENABLED ?? "true").toLowerCase() !== "false";
}

export type SpellbookDeck = { commanders: string[]; main: string[] };

type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

let nextSlot = 0;
async function politeFetch(url: string, init: RequestInit): Promise<Response> {
  const wait = nextSlot - Date.now();
  nextSlot = Math.max(Date.now(), nextSlot) + GAP_MS;
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  return fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
}

/** Cache key for a deck list: order and duplicates don't matter. */
export function deckKey(deck: SpellbookDeck): string {
  const norm = (ns: string[]) => [...new Set(ns.map((n) => n.trim()).filter(Boolean))].sort();
  const hash = createHash("sha256").update(JSON.stringify([norm(deck.commanders), norm(deck.main)])).digest("hex");
  return `spellbook/find-my-combos/${hash.slice(0, 32)}`;
}

/** The deck's combos from Spellbook, through the cache. Undefined when switched off or unreachable with nothing cached. */
export async function findMyCombos(db: Db, deck: SpellbookDeck, opts: { fetchImpl?: FetchLike } = {}): Promise<(SpellbookCombos & { fetchedAt: string }) | undefined> {
  const key = deckKey(deck);
  const [cached] = await db.select().from(edhrecCache).where(eq(edhrecCache.key, key));
  const stale = cached?.status === 200 ? { ...(JSON.parse(cached.json) as SpellbookCombos), fetchedAt: cached.fetchedAt } : undefined;
  if (stale && Date.now() - Date.parse(cached.fetchedAt) < TTL_MS) return stale;
  if (!spellbookEnabled()) return stale;

  const body = JSON.stringify({
    commanders: [...new Set(deck.commanders)].map((card) => ({ card })),
    main: [...new Set(deck.main)].map((card) => ({ card })),
  });
  const doFetch = opts.fetchImpl ?? politeFetch;
  try {
    const pages: FindMyCombosPage[] = [];
    let url: string | null = `${ENDPOINT}?limit=${PAGE_SIZE}`;
    while (url && pages.length < MAX_PAGES) {
      const res = await doFetch(url, {
        method: "POST",
        headers: { "User-Agent": USER_AGENT, Accept: "application/json", "Content-Type": "application/json" },
        body,
      });
      if (!res.ok) throw new Error(`Commander Spellbook ${res.status}`);
      const page = (await res.json()) as FindMyCombosPage;
      pages.push(page);
      url = page.next && page.next.startsWith(ENDPOINT) ? page.next : null;
    }
    const parsed = parseFindMyCombos(pages);
    const fetchedAt = new Date().toISOString();
    const json = JSON.stringify(parsed);
    await db
      .insert(edhrecCache)
      .values({ key, json, fetchedAt, status: 200 })
      .onConflictDoUpdate({ target: edhrecCache.key, set: { json, fetchedAt, status: 200 } });
    return { ...parsed, fetchedAt };
  } catch {
    // Offline or Spellbook trouble: an old answer beats none.
    return stale;
  }
}

export type DeckCombos = {
  /** Where the combos came from. "builtin" is the 42-combo offline list. */
  source: "spellbook" | "builtin";
  /** Combos with every piece in the deck. Pass these to `analyzeDeck(entries, { combos })`. */
  combos: Combo[];
  /** Combos one card away, most popular first, with the missing card. */
  near: { combo: Combo; missing: string }[];
  fetchedAt?: string;
};

/** The command zone and the 99 (companions sit outside the deck, so they're left out). */
function deckOf(entries: readonly DeckEntry[]): SpellbookDeck {
  return {
    commanders: entries.filter((e) => e.board === "commander").map((e) => e.card.name),
    main: entries.filter((e) => (e.board ?? "main") === "main").map((e) => e.card.name),
  };
}

/**
 * Combos in a deck and combos one card away, from Commander Spellbook when it answers, else from the
 * built-in list. Card names come back spelled as the deck spells them.
 */
export async function deckCombos(db: Db, entries: readonly DeckEntry[], opts: { nearLimit?: number; fetchImpl?: FetchLike } = {}): Promise<DeckCombos> {
  const deck = deckOf(entries);
  const names = [...deck.commanders, ...deck.main];
  const limit = opts.nearLimit ?? 30;
  const sb = names.length ? await findMyCombos(db, deck, { fetchImpl: opts.fetchImpl }) : undefined;
  if (!sb) {
    return { source: "builtin", combos: findCombos(names, KNOWN_TWO_CARD_COMBOS), near: nearCombos(names, KNOWN_TWO_CARD_COMBOS).slice(0, limit) };
  }
  const combos = findCombos(names, renameToDeck(sb.included, names));
  const near = nearCombos(names, renameToDeck(sb.almostIncluded, names))
    .sort((a, b) => (b.combo.popularity ?? 0) - (a.combo.popularity ?? 0))
    .slice(0, limit);
  return { source: "spellbook", combos, near, fetchedAt: sb.fetchedAt };
}
