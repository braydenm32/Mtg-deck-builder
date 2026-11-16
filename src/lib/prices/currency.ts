import { eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { meta } from "@/db/schema";
import { refreshInBackground } from "@/lib/background";
import { USER_AGENT } from "@/lib/scryfall/client";

/**
 * Prices in USD or AUD (Brayden, 2026-11-15). Card prices come from Scryfall in USD (TCGplayer);
 * AUD is a conversion at the European Central Bank's daily rate, from Frankfurter (frankfurter.dev,
 * free, no key). The rate is cached in the meta table for a day. AUD prices are estimates, so the UI
 * should say "converted from USD" somewhere near them.
 *
 * AUD_PER_USD in the environment pins the rate (handy offline). With no rate fetched yet and no
 * network, a fallback rate is used and reported as such.
 */
export type Currency = "USD" | "AUD";
export const CURRENCIES: readonly Currency[] = ["USD", "AUD"];

/** Used only before any rate has been fetched. Roughly the 2025-26 range; the UI shows `source`. */
export const FALLBACK_AUD_PER_USD = 1.55;

const URL = "https://api.frankfurter.dev/v1/latest?base=USD&symbols=AUD";
const KEY = "fx:USD:AUD";
const TTL_MS = 24 * 3600 * 1000;

export type UsdToAud = {
  rate: number;
  /** The rate's date (YYYY-MM-DD) as published, when known. */
  date: string | null;
  /** "ecb": fetched just now; "cached": an earlier fetch; "env": AUD_PER_USD; "fallback": built-in guess. */
  source: "ecb" | "cached" | "env" | "fallback";
};

type Stored = { rate: number; date: string | null; fetchedAt: string };

/** USD → AUD rate, through the daily cache. Never throws. */
export async function getUsdToAud(db: Db, opts: { fetchImpl?: typeof fetch } = {}): Promise<UsdToAud> {
  const pinned = Number.parseFloat(process.env.AUD_PER_USD ?? "");
  if (Number.isFinite(pinned) && pinned > 0) return { rate: pinned, date: null, source: "env" };

  const [row] = await db.select().from(meta).where(eq(meta.key, KEY));
  let stored: Stored | undefined;
  try {
    stored = row ? (JSON.parse(row.value) as Stored) : undefined;
  } catch {
    stored = undefined;
  }
  if (stored && Date.now() - Date.parse(stored.fetchedAt) < TTL_MS) return { rate: stored.rate, date: stored.date, source: "cached" };
  // Yesterday's rate is fine for this page: fetch today's after the response, for the next one.
  if (stored && refreshInBackground("fx:usd-aud", () => fetchRate(db, opts))) return { rate: stored.rate, date: stored.date, source: "cached" };
  return (await fetchRate(db, opts)) ?? (stored ? { rate: stored.rate, date: stored.date, source: "cached" } : { rate: FALLBACK_AUD_PER_USD, date: null, source: "fallback" });
}

/** After a failed fetch, wait this long before trying again (so an outage doesn't slow every page). */
const RETRY_AFTER_MS = 10 * 60 * 1000;
let failedAt = 0;

async function fetchRate(db: Db, opts: { fetchImpl?: typeof fetch }): Promise<UsdToAud | undefined> {
  if (!opts.fetchImpl && Date.now() - failedAt < RETRY_AFTER_MS) return undefined;
  try {
    const res = await (opts.fetchImpl ?? fetch)(URL, { headers: { "User-Agent": USER_AGENT, Accept: "application/json" }, signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`Frankfurter ${res.status}`);
    const json = (await res.json()) as { date?: string; rates?: { AUD?: number } };
    const rate = json.rates?.AUD;
    if (typeof rate !== "number" || !(rate > 0)) throw new Error("No AUD rate");
    const value: Stored = { rate, date: json.date ?? null, fetchedAt: new Date().toISOString() };
    await db
      .insert(meta)
      .values({ key: KEY, value: JSON.stringify(value) })
      .onConflictDoUpdate({ target: meta.key, set: { value: JSON.stringify(value) } });
    return { rate, date: value.date, source: "ecb" };
  } catch {
    failedAt = Date.now();
    return undefined;
  }
}

/** A USD amount in the chosen currency. */
export function fromUsd(usd: number, currency: Currency, audPerUsd: number): number {
  return currency === "AUD" ? usd * audPerUsd : usd;
}

/** "$12.34" for USD, "A$18.90" for AUD (so the two are never mistaken for each other). */
export function formatMoney(amount: number | null | undefined, currency: Currency = "USD"): string {
  if (amount == null || !Number.isFinite(amount)) return "—";
  return amount.toLocaleString("en-US", { style: "currency", currency });
}

/** Convert and format in one go: `formatUsd(12.34, "AUD", 1.53)` → "A$18.88". */
export function formatUsd(usd: number | null | undefined, currency: Currency = "USD", audPerUsd = FALLBACK_AUD_PER_USD): string {
  return usd == null ? "—" : formatMoney(fromUsd(usd, currency, audPerUsd), currency);
}
