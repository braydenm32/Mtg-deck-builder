/**
 * Buy or proxy: for the cards a deck needs that aren't in the collection at all, which to buy and
 * which to suggest proxying instead.
 *
 * Brayden proxies rarely, only when a card is far too expensive (2026-11-15). So proxying is only
 * suggested for single copies at or above `proxyAbove` (default $30 USD), and, when a budget is set,
 * for the priciest remaining cards until the buy total fits the budget. Everything else is "buy".
 * Proxies in the collection count as owned, so the caller passes only cards with no copy at all.
 * Prices are USD (Scryfall's TCGplayer price); convert for display with lib/prices/currency.ts.
 */

export type MissingCard = { name: string; quantity: number; /** USD per copy, cheapest printing. */ unitPrice: number | null };

export type ProxyReason = "expensive" | "budget";

export type BuyOrProxy = {
  buy: MissingCard[];
  proxy: (MissingCard & { reason: ProxyReason })[];
  /** No price known (new or unusual printings): the person decides. */
  noPrice: MissingCard[];
  /** USD to buy everything in `buy`. */
  buyTotal: number;
  /** USD that proxying `proxy` saves. */
  proxySaves: number;
  /** The total if you bought every priced card. */
  fullTotal: number;
};

/** A single copy at or above this (USD) is "far too expensive": suggest a proxy. */
export const DEFAULT_PROXY_ABOVE_USD = 30;

const cents = (n: number) => Math.round(n * 100) / 100;
const cost = (c: MissingCard) => (c.unitPrice ?? 0) * c.quantity;

export function buyOrProxy(cards: readonly MissingCard[], opts: { proxyAbove?: number | null; budget?: number | null } = {}): BuyOrProxy {
  const proxyAbove = opts.proxyAbove === undefined ? DEFAULT_PROXY_ABOVE_USD : opts.proxyAbove;
  const noPrice = cards.filter((c) => c.unitPrice == null);
  const priced = cards.filter((c) => c.unitPrice != null).sort((a, b) => b.unitPrice! - a.unitPrice! || a.name.localeCompare(b.name));
  const proxy: BuyOrProxy["proxy"] = [];
  let buy: MissingCard[] = [];
  for (const c of priced) {
    if (proxyAbove != null && c.unitPrice! >= proxyAbove) proxy.push({ ...c, reason: "expensive" });
    else buy.push(c);
  }
  // Over budget: proxy the priciest remaining cards first, until the rest fits.
  if (opts.budget != null) {
    let total = buy.reduce((n, c) => n + cost(c), 0);
    const keep: MissingCard[] = [];
    for (const c of buy) {
      if (total > opts.budget + 1e-9) {
        proxy.push({ ...c, reason: "budget" });
        total -= cost(c);
      } else keep.push(c);
    }
    buy = keep;
  }
  return {
    buy,
    proxy,
    noPrice,
    buyTotal: cents(buy.reduce((n, c) => n + cost(c), 0)),
    proxySaves: cents(proxy.reduce((n, c) => n + cost(c), 0)),
    fullTotal: cents(priced.reduce((n, c) => n + cost(c), 0)),
  };
}

/** Upgrades to buy within a budget (the Upgrades tab's "On a budget"). */
export type BudgetCard = { oracleId: string; name: string; priceUsd: number | null; score: number | null };

/** The best upgrades that fit a budget: strongest first, each taken while the money lasts. */
export function planBudget(cards: readonly BudgetCard[], budgetUsd: number) {
  let left = budgetUsd;
  const picks: BudgetCard[] = [];
  for (const c of [...cards].sort((a, b) => (b.score ?? 0) - (a.score ?? 0))) {
    if (c.priceUsd == null || c.priceUsd > left) continue;
    picks.push(c);
    left -= c.priceUsd;
  }
  return { picks, spent: budgetUsd - left };
}
