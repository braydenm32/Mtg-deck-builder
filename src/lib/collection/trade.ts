/**
 * The trade calculator's sums: each side's cards at the prices you agreed (market price to start),
 * and the cash that evens it. Pure, so the page can run it as you type, and tests can check it.
 */

export type TradeLine = { oracleId: string; name: string; quantity: number; /** Each, in US dollars; null when there's no price. */ priceUsd: number | null };

export type TradeTotals = {
  give: number;
  get: number;
  /** get − give: above 0 you come out ahead, below 0 they do. */
  difference: number;
  /** Lines with no price, so the totals leave them out. */
  unpriced: number;
};

const round = (n: number) => Math.round(n * 100) / 100;
const sum = (lines: readonly TradeLine[]) => lines.reduce((n, l) => n + (l.priceUsd ?? 0) * l.quantity, 0);

export function tradeTotals(give: readonly TradeLine[], get: readonly TradeLine[]): TradeTotals {
  const g = round(sum(give));
  const r = round(sum(get));
  return { give: g, get: r, difference: round(r - g), unpriced: [...give, ...get].filter((l) => l.priceUsd == null).length };
}

/** Within a dollar either way is called even: card prices aren't that exact. */
export function tradeVerdict(t: TradeTotals): "even" | "you-ahead" | "they-ahead" {
  if (Math.abs(t.difference) < 1) return "even";
  return t.difference > 0 ? "you-ahead" : "they-ahead";
}

/** Add a card to a side, or one more copy when it's there already. */
export function addLine(lines: readonly TradeLine[], card: Omit<TradeLine, "quantity">): TradeLine[] {
  const at = lines.findIndex((l) => l.oracleId === card.oracleId);
  if (at < 0) return [...lines, { ...card, quantity: 1 }];
  return lines.map((l, i) => (i === at ? { ...l, quantity: l.quantity + 1 } : l));
}
