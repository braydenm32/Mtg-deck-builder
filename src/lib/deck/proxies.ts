/**
 * Which cards go on a deck's proxy sheet, one entry per copy, and how they fill pages of nine
 * (3×3 at card size: 63 × 88 mm, which fits A4 and US Letter). Pure, for the page and the tests.
 */

export type ProxyWhich = "marked" | "missing" | "all";
export const PROXY_WHICH: readonly ProxyWhich[] = ["marked", "missing", "all"];
export const PER_PAGE = 9;

export type ProxyRow = {
  name: string;
  quantity: number;
  board: string;
  state: string;
  acquire: "buy" | "proxy" | null;
  basic: boolean;
  imageNormal: string | null;
  custom: boolean;
  manaCost: string | null;
  typeLine: string;
  oracleText: string;
};

export type ProxyCard = Pick<ProxyRow, "name" | "imageNormal" | "custom" | "manaCost" | "typeLine" | "oracleText">;

/** "marked": cards you marked to proxy; "missing": every card you don't own; "all": the whole deck. Basic lands only with "all". */
export function proxyCards(rows: readonly ProxyRow[], which: ProxyWhich): ProxyCard[] {
  const inDeck = rows.filter((r) => r.board === "main" || r.board === "commander");
  const pick = inDeck.filter((r) => {
    if (which === "all") return true;
    if (r.basic) return false;
    if (which === "missing") return r.state === "not-owned";
    return r.state === "not-owned" && (r.acquire === "proxy" || r.custom);
  });
  return pick.flatMap((r) =>
    Array.from({ length: Math.max(1, r.quantity) }, () => ({ name: r.name, imageNormal: r.imageNormal, custom: r.custom, manaCost: r.manaCost, typeLine: r.typeLine, oracleText: r.oracleText })),
  );
}

export function proxyPages<T>(cards: readonly T[]): T[][] {
  return Array.from({ length: Math.ceil(cards.length / PER_PAGE) }, (_, i) => cards.slice(i * PER_PAGE, i * PER_PAGE + PER_PAGE));
}
