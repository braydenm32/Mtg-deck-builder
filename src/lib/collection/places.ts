import { sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { STACK_PRICE } from "./query";

export type PlaceSummary = {
  /** The box or binder's name. */
  location: string;
  /** Every copy in it, proxies included (R1). */
  copies: number;
  /** Different cards in it. */
  cards: number;
  proxies: number;
  /** Real copies' value in US dollars (R3); null when none has a price. */
  value: number | null;
  /** When a card last went in. */
  lastAdded: string;
};

export type Places = {
  places: PlaceSummary[];
  /** Copies with no box or binder that aren't proxies: Today's "need a home" count. */
  needsHome: number;
};

/**
 * Every box and binder with what's in it, most copies first, plus the cards that still need a
 * home. One query over the collection (no full scan of printings).
 */
export async function placesSummary(db: Db): Promise<Places> {
  const rows = await db.all<Record<string, unknown>>(sql`
    SELECT ci.location AS location,
           SUM(ci.quantity) AS copies,
           COUNT(DISTINCT ci.oracle_id) AS cards,
           SUM(CASE WHEN ci.proxy THEN ci.quantity ELSE 0 END) AS proxies,
           SUM(CASE WHEN ci.proxy THEN 0 ELSE ci.quantity * (${STACK_PRICE}) END) AS value,
           MAX(ci.added_at) AS last_added
    FROM collection_items ci
    CROSS JOIN printings p ON p.id = ci.printing_id
    JOIN cards c ON c.oracle_id = ci.oracle_id
    GROUP BY ci.location
    ORDER BY SUM(ci.quantity) DESC, ci.location`);
  let needsHome = 0;
  const places: PlaceSummary[] = [];
  for (const r of rows) {
    const location = String(r.location ?? "");
    if (!location) {
      needsHome = Number(r.copies) - Number(r.proxies);
      continue;
    }
    places.push({
      location,
      copies: Number(r.copies),
      cards: Number(r.cards),
      proxies: Number(r.proxies),
      value: r.value == null ? null : Number(r.value),
      lastAdded: String(r.last_added),
    });
  }
  return { places, needsHome };
}
