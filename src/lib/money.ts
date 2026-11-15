/**
 * Price display. Every price in the app is stored in US dollars (Scryfall's `usd`) and shown through
 * `formatMoney`, which applies the app settings: hide prices, or show them in Australian dollars.
 * Pure and safe to use in client components; the server builds the PriceView (see lib/settings.ts).
 */
export type Currency = "USD" | "AUD";

export type PriceView = {
  /** Hide every price in the app. */
  hide: boolean;
  currency: Currency;
  /** Australian dollars per US dollar. */
  audPerUsd: number;
  /** When that rate was published (YYYY-MM-DD), or null for the built-in fallback. */
  rateDate: string | null;
};

export const DEFAULT_PRICE_VIEW: PriceView = { hide: false, currency: "USD", audPerUsd: 1.55, rateDate: null };

const SYMBOL: Record<Currency, string> = { USD: "US$", AUD: "A$" };

/** A US-dollar amount in the chosen currency. */
export const convert = (usd: number, view: PriceView) => (view.currency === "AUD" ? usd * view.audPerUsd : usd);

/** Back to US dollars (for a price the user typed in their currency). */
export const toUsd = (amount: number, view: PriceView) => (view.currency === "AUD" ? amount / view.audPerUsd : amount);

export const currencySymbol = (view: PriceView) => SYMBOL[view.currency];

/**
 * "US$12.50" or "A$19.40". Returns null when prices are hidden, so callers can leave the price out
 * entirely; a missing price shows as "—".
 */
export function formatMoney(usd: number | null | undefined, view: PriceView = DEFAULT_PRICE_VIEW): string | null {
  if (view.hide) return null;
  if (usd == null || !Number.isFinite(usd)) return "—";
  const n = convert(usd, view);
  return `${SYMBOL[view.currency]}${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
