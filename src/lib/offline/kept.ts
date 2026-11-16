"use client";

/**
 * Data the device keeps for working offline, in the same Cache Storage the service worker keeps
 * (public/sw.js leaves "tutor-data-v1" alone when it starts its own caches afresh). Each entry
 * records when it was saved and when its request started (so edits sent after that aren't in it),
 * and the service worker marks a deck's copy out of date when that deck's edits are sent.
 */

export const DATA_CACHE = "tutor-data-v1";
const SAVED_AT = "x-tutor-saved-at";
const STARTED_AT = "x-tutor-started-at";
const STALE = "x-tutor-stale";

export const hasCaches = () => typeof window !== "undefined" && "caches" in window;

export type Kept<T> = { data: T; savedAt: number; startedAt: number; stale: boolean; etag: string | null };

/** The kept copy of `path`, or null when there's none (or storage can't be read). */
export async function readKept<T>(path: string): Promise<Kept<T> | null> {
  if (!hasCaches()) return null;
  try {
    const res = await (await caches.open(DATA_CACHE)).match(path);
    if (!res) return null;
    const savedAt = Date.parse(res.headers.get(SAVED_AT) ?? "") || 0;
    return {
      data: (await res.json()) as T,
      savedAt,
      startedAt: Number(res.headers.get(STARTED_AT)) || savedAt,
      stale: !!res.headers.get(STALE),
      etag: res.headers.get("etag"),
    };
  } catch {
    return null;
  }
}

/**
 * Fetch `path` and keep it. With `maxAgeMs`, a kept copy younger than that (and not out of date) is
 * left as it is; a kept copy with an etag is asked about first, so an unchanged one costs a 304.
 * "changed" when a new copy was kept, "same" when the kept one is still right, "failed" offline,
 * when the server didn't answer, or when storage is full.
 */
export async function refreshKept(path: string, opts: { maxAgeMs?: number } = {}): Promise<"changed" | "same" | "failed"> {
  if (!hasCaches() || navigator.onLine === false) return "failed";
  try {
    const cache = await caches.open(DATA_CACHE);
    const saved = await cache.match(path);
    const at = Date.parse(saved?.headers.get(SAVED_AT) ?? "");
    if (saved && opts.maxAgeMs && !saved.headers.get(STALE) && Date.now() - at < opts.maxAgeMs) return "same";
    const etag = saved?.headers.get("etag");
    const startedAt = Date.now();
    const res = await fetch(path, { headers: etag ? { "if-none-match": etag } : {} });
    if (res.redirected || !(res.ok || (res.status === 304 && saved))) return "failed";
    const fresh = res.status !== 304;
    if (fresh && !(res.headers.get("content-type") ?? "").includes("json")) return "failed";
    const body = fresh ? await res.text() : await saved!.text();
    const headers = {
      "content-type": "application/json",
      etag: res.headers.get("etag") ?? etag ?? "",
      [SAVED_AT]: new Date().toISOString(),
      [STARTED_AT]: String(startedAt),
    };
    await cache.put(path, new Response(body, { headers }));
    return fresh ? "changed" : "same";
  } catch {
    return "failed";
  }
}
