import { sql } from "drizzle-orm";
import type { Db } from "@/db/client";

/**
 * What buying the cheapest printing saves over the newest one: the want list's prices are already
 * the cheapest printing of each card, while a shop or a search usually turns up the newest. Only
 * cards where the newest printing has a price count.
 */

/** Each card's newest regular English printing (not a promo, showcase or Secret Lair, where there is one) with a non-foil price, in US dollars. */
export async function newestPrices(db: Db, oracleIds: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  for (let i = 0; i < oracleIds.length; i += 400) {
    const ids = oracleIds.slice(i, i + 400);
    if (!ids.length) continue;
    const rows = await db.all<{ oracle_id: string; price_usd: number }>(sql`
      SELECT oracle_id, price_usd FROM (
        SELECT oracle_id, price_usd, ROW_NUMBER() OVER (PARTITION BY oracle_id ORDER BY variant_rank > 0, released_at DESC) AS rn
        FROM printings
        WHERE oracle_id IN (${sql.join(ids.map((id) => sql`${id}`), sql`, `)}) AND lang = 'en' AND price_usd IS NOT NULL
      ) WHERE rn = 1`);
    for (const r of rows) out.set(r.oracle_id, Number(r.price_usd));
  }
  return out;
}

export type SavingLine = { copies: number; cheapestUsd: number | null; newestUsd: number | null | undefined };

/** The total the cheapest printings save, and how many cards that covers. */
export function printingSavings(lines: readonly SavingLine[]): { usd: number; cards: number } {
  let usd = 0;
  let cards = 0;
  for (const l of lines) {
    if (l.cheapestUsd == null || l.newestUsd == null) continue;
    const each = l.newestUsd - l.cheapestUsd;
    if (each < 0.01) continue;
    usd += each * l.copies;
    cards += 1;
  }
  return { usd: Math.round(usd * 100) / 100, cards };
}
