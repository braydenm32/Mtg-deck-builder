/**
 * App-wide settings, kept in the `meta` table under "settings" as JSON. One user, so no accounts.
 */
import { cache } from "react";
import { eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { getDb } from "@/db/client";
import { meta } from "@/db/schema";
import { DEFAULT_PRICE_VIEW, type Currency, type PriceView } from "./money";

export type AppSettings = {
  /** Hide prices everywhere in the app. */
  hidePrices: boolean;
  currency: Currency;
};

export const DEFAULT_SETTINGS: AppSettings = { hidePrices: false, currency: "USD" };
const KEY = "settings";

export async function getSettings(db: Db): Promise<AppSettings> {
  const [row] = await db.select().from(meta).where(eq(meta.key, KEY));
  if (!row) return { ...DEFAULT_SETTINGS };
  try {
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(row.value) as Partial<AppSettings>) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export async function saveSettings(db: Db, patch: Partial<AppSettings>): Promise<AppSettings> {
  const next = { ...(await getSettings(db)), ...patch };
  const value = JSON.stringify(next);
  await db.insert(meta).values({ key: KEY, value }).onConflictDoUpdate({ target: meta.key, set: { value } });
  return next;
}

/** US$ → A$ rate. Placeholder until the exchange-rate helper lands; uses the built-in fallback. */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function audRate(_db: Db): Promise<{ rate: number; date: string | null }> {
  return { rate: DEFAULT_PRICE_VIEW.audPerUsd, date: DEFAULT_PRICE_VIEW.rateDate };
}

export async function priceView(db: Db): Promise<PriceView> {
  const s = await getSettings(db);
  const fx = s.currency === "AUD" ? await audRate(db) : { rate: DEFAULT_PRICE_VIEW.audPerUsd, date: null };
  return { hide: s.hidePrices, currency: s.currency, audPerUsd: fx.rate, rateDate: fx.date };
}

/** The price view for this request (pages and layouts share one lookup). */
export const getPriceView = cache(async () => priceView(await getDb()));
