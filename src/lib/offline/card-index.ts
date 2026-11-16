"use client";

import { fitsIdentity, matchNames, type CardListRow } from "@/lib/cards/name-search";
import { normName } from "@/lib/cards/normalize";

/**
 * Every card you can put in a deck, kept on this device (about 1 MB to download, refreshed at most
 * once a day and only when it changed), so the deck's add-a-card search answers as you type and works
 * offline. Same list and same matching as /api/cards/search. See docs/speed.md, stage 3.
 */

export type IndexCard = { oracleId: string; name: string; normName: string; typeLine: string; colorIdentity: string; commander: boolean };

/** Shared with the service worker, which keeps it when it starts its own caches afresh (public/sw.js). */
const CACHE = "tutor-data-v1";
const URL_PATH = "/api/cards/names";
const SAVED_AT = "x-tutor-saved-at";
const REFRESH_AFTER_MS = 24 * 60 * 60 * 1000;

let loaded: Promise<IndexCard[] | null> | undefined;

const hasCaches = () => typeof window !== "undefined" && "caches" in window;

/** The list as the device searches it (each name normalised once). */
export function parseCardList(rows: CardListRow[]): IndexCard[] {
  return rows.map(([oracleId, name, typeLine, colorIdentity, commander]) => ({ oracleId, name, normName: normName(name), typeLine, colorIdentity, commander: commander === 1 }));
}

/** The device's card list, or null when there's none yet (it's fetched by refreshCardIndex). */
export function cardIndex(): Promise<IndexCard[] | null> {
  loaded ??= (async () => {
    if (!hasCaches()) return null;
    try {
      const res = await (await caches.open(CACHE)).match(URL_PATH);
      return res ? parseCardList(((await res.json()) as { cards: CardListRow[] }).cards) : null;
    } catch {
      return null;
    }
  })();
  return loaded;
}

let refreshing: Promise<void> | undefined;

/**
 * Fetch the list when this device has none, or its copy is a day old and the server's has changed.
 * Quietly does nothing offline or when storage is unavailable.
 */
export function refreshCardIndex(): Promise<void> {
  refreshing ??= fetchIndex().finally(() => {
    refreshing = undefined;
  });
  return refreshing;
}

async function fetchIndex() {
  if (!hasCaches() || navigator.onLine === false) return;
  try {
    const cache = await caches.open(CACHE);
    const saved = await cache.match(URL_PATH);
    const at = Date.parse(saved?.headers.get(SAVED_AT) ?? "");
    if (saved && Date.now() - at < REFRESH_AFTER_MS) return;
    const etag = saved?.headers.get("etag");
    const res = await fetch(URL_PATH, { headers: etag ? { "if-none-match": etag } : {} });
    const body = res.status === 304 && saved ? await saved.text() : res.ok ? await res.text() : undefined;
    if (body === undefined) return;
    const headers = { "content-type": "application/json", etag: res.headers.get("etag") ?? etag ?? "", [SAVED_AT]: new Date().toISOString() };
    await cache.put(URL_PATH, new Response(body, { headers }));
    if (res.status !== 304) loaded = Promise.resolve(parseCardList((JSON.parse(body) as { cards: CardListRow[] }).cards));
  } catch {
    // Offline, server down, or storage full: try again next time.
  }
}

/** Search the device's list like /api/cards/search: in a deck's colours, or only possible commanders. */
export function searchCardIndex(cards: readonly IndexCard[], query: string, opts: { identity?: string; commander?: boolean; limit?: number } = {}): IndexCard[] {
  const inIdentity = fitsIdentity(opts.identity);
  return matchNames(cards, query, opts.limit ?? 20, (c) => (!opts.commander || c.commander) && inIdentity(c.colorIdentity));
}
