import { createHash } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import type { Db } from "@/db/client";
import { edhrecCache } from "@/db/schema";
import { findCombos, KNOWN_TWO_CARD_COMBOS, nearCombos, type Combo } from "@/lib/deck/combos";
import type { DeckEntry } from "@/lib/deck/types";
import { inBackground } from "@/lib/background";
import { USER_AGENT } from "@/lib/scryfall/client";
import { parseFindMyCombos, renameToDeck, type FindMyCombosPage, type SpellbookCombos } from "./parse";

/**
 * Commander Spellbook (commanderspellbook.com), the combo database behind EDHREC's combo pages.
 * Brayden approved using it on 2026-11-15. One "find my combos" request per deck list:
 * - only when a deck is opened or analysed, never crawled
 * - cached for 7 days in the shared HTTP cache table (keys "spellbook/..."), keyed by the deck's cards,
 *   so an unchanged deck never asks again
 * - at most one request per second, with a timeout and one retry
 * - SPELLBOOK_ENABLED=false turns it off; the built-in combo list is used instead
 */
const ENDPOINT = "https://backend.commanderspellbook.com/find-my-combos";
const PAGE_SIZE = 1000;
const MAX_PAGES = 3;
const TTL_MS = 7 * 24 * 3600 * 1000;
const GAP_MS = 1000;
const TIMEOUT_MS = 15_000;
const RETRY_MS = 3000;

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
  // "v2": bump when the stored shape changes, so old cache rows are simply ignored.
  return `spellbook/v2/find-my-combos/${hash.slice(0, 32)}`;
}

/** Where a deck's last answer is kept, so a changed list can be shown at once (see findMyCombos). */
const latestKey = (deckId: number) => `spellbook/v2/deck/${deckId}`;
/** With nothing cached at all, a page waits this long for Spellbook, then carries on without it. */
const FIRST_WAIT_MS = 5000;

type Background = (task: Promise<unknown>) => boolean;

export type FindOptions = {
  fetchImpl?: FetchLike;
  retryDelayMs?: number;
  /** The deck these cards belong to: its last answer stands in while a changed list is checked. */
  deckId?: number;
  /** Finish the request after the response (src/lib/background.ts). Returns false where it can't. */
  background?: Background;
  /** With nothing cached, how long to wait before carrying on without Spellbook (default 5 s). */
  firstWaitMs?: number;
};

type Found = SpellbookCombos & { fetchedAt: string; stale?: boolean };

/**
 * The deck's combos from Spellbook, through the cache. Undefined when switched off or unreachable with
 * nothing cached.
 *
 * A page never waits for Spellbook when it has any answer to show: a cached answer older than a
 * week, or (for a deck whose list changed since) the deck's last answer, adjusted to the new list,
 * is returned at once and Spellbook is asked again in the background for next time. The adjustment
 * is exact for a card added or removed: every combo a single new card completes was in the old
 * "almost included" list.
 */
export async function findMyCombos(db: Db, deck: SpellbookDeck, opts: FindOptions = {}): Promise<Found | undefined> {
  const key = deckKey(deck);
  const keys = opts.deckId ? [key, latestKey(opts.deckId)] : [key];
  const rows = await db.select().from(edhrecCache).where(inArray(edhrecCache.key, keys));
  const cached = rows.find((r) => r.key === key);
  const exact = cached?.status === 200 ? { ...(JSON.parse(cached.json) as SpellbookCombos), fetchedAt: cached.fetchedAt } : undefined;
  if (exact && Date.now() - Date.parse(cached!.fetchedAt) < TTL_MS) return exact;
  if (!spellbookEnabled()) return exact;

  const fetching = fetchAndStore(db, deck, key, opts);
  const background = opts.background ?? inBackground;
  const standIn = exact ?? (opts.deckId ? await lastAnswer(db, rows.find((r) => r.key === latestKey(opts.deckId!))?.json) : undefined);
  if (standIn && background(fetching)) return { ...standIn, stale: true };
  if (!standIn) {
    // Nothing to show yet: wait a little, then let the answer arrive for next time.
    const timer = new Promise<"slow">((r) => setTimeout(() => r("slow"), opts.firstWaitMs ?? FIRST_WAIT_MS).unref?.());
    const first = await Promise.race([fetching, timer]);
    if (first !== "slow") return first ?? undefined;
    if (background(fetching)) return undefined;
  }
  return (await fetching) ?? standIn;
}

/** The deck's last answer (by the key it points at), with both lists merged for any list of cards. */
async function lastAnswer(db: Db, pointer: string | undefined): Promise<Found | undefined> {
  if (!pointer) return undefined;
  const [row] = await db.select().from(edhrecCache).where(eq(edhrecCache.key, pointer));
  if (row?.status !== 200) return undefined;
  const old = JSON.parse(row.json) as SpellbookCombos;
  // deckCombos keeps the ones fully in the deck as included, and the ones a card short as near.
  const pool = [...old.included, ...old.almostIncluded];
  return { identity: old.identity, included: pool, almostIncluded: pool, fetchedAt: row.fetchedAt };
}

/** Ask Spellbook, store the answer (and, for a deck, point at it). Undefined when it can't be reached. */
async function fetchAndStore(db: Db, deck: SpellbookDeck, key: string, opts: FindOptions): Promise<Found | undefined> {
  const body = JSON.stringify({
    commanders: [...new Set(deck.commanders)].map((card) => ({ card })),
    main: [...new Set(deck.main)].map((card) => ({ card })),
  });
  const doFetch = opts.fetchImpl ?? politeFetch;
  try {
    const pages: FindMyCombosPage[] = [];
    let url: string | null = `${ENDPOINT}?limit=${PAGE_SIZE}`;
    while (url && pages.length < MAX_PAGES) {
      const init: RequestInit = {
        method: "POST",
        headers: { "User-Agent": USER_AGENT, Accept: "application/json", "Content-Type": "application/json" },
        body,
      };
      let res: Response;
      try {
        res = await doFetch(url, init);
      } catch {
        res = new Response(null, { status: 599 });
      }
      // One retry after a pause for throttling, server hiccups and dropped connections.
      if (res.status === 429 || res.status >= 500) {
        await new Promise((r) => setTimeout(r, opts.retryDelayMs ?? RETRY_MS));
        res = await doFetch(url, init);
      }
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
    if (opts.deckId) await pointAt(db, latestKey(opts.deckId), key, fetchedAt);
    return { ...parsed, fetchedAt };
  } catch {
    // Offline or Spellbook trouble.
    return undefined;
  }
}

/** Point a deck at its newest answer, and drop the answer it pointed at before (its list is gone). */
async function pointAt(db: Db, pointer: string, key: string, fetchedAt: string) {
  const [prev] = await db.select({ json: edhrecCache.json }).from(edhrecCache).where(eq(edhrecCache.key, pointer));
  await db
    .insert(edhrecCache)
    .values({ key: pointer, json: key, fetchedAt, status: 0 })
    .onConflictDoUpdate({ target: edhrecCache.key, set: { json: key, fetchedAt, status: 0 } });
  if (prev && prev.json !== key && prev.json.startsWith("spellbook/")) await db.delete(edhrecCache).where(eq(edhrecCache.key, prev.json));
}

export type DeckCombos = {
  /** Where the combos came from. "builtin" is the 42-combo offline list. */
  source: "spellbook" | "builtin";
  /** Combos with every piece in the deck. Pass these to `analyzeDeck(entries, { combos })`. */
  combos: Combo[];
  /** Combos one card away, most popular first, with the missing card. */
  near: { combo: Combo; missing: string }[];
  /**
   * Spellbook's combos for this deck (complete or one card away), spelled as the deck spells them,
   * so the device can find complete and near combos again after an edit. Absent for "builtin".
   */
  pool?: Combo[];
  fetchedAt?: string;
  /** An earlier answer, shown while Spellbook is asked again in the background. */
  stale?: boolean;
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
export async function deckCombos(db: Db, entries: readonly DeckEntry[], opts: FindOptions & { nearLimit?: number } = {}): Promise<DeckCombos> {
  const deck = deckOf(entries);
  const names = [...deck.commanders, ...deck.main];
  const limit = opts.nearLimit ?? 30;
  const sb = names.length ? await findMyCombos(db, deck, opts) : undefined;
  if (!sb) {
    return { source: "builtin", combos: findCombos(names, KNOWN_TWO_CARD_COMBOS), near: nearCombos(names, KNOWN_TWO_CARD_COMBOS).slice(0, limit) };
  }
  const included = renameToDeck(sb.included, names);
  const almost = renameToDeck(sb.almostIncluded, names);
  const combos = findCombos(names, included);
  const near = nearCombos(names, almost)
    .sort((a, b) => (b.combo.popularity ?? 0) - (a.combo.popularity ?? 0))
    .slice(0, limit);
  return { source: "spellbook", combos, near, pool: [...included, ...almost], fetchedAt: sb.fetchedAt, ...(sb.stale ? { stale: true } : {}) };
}
