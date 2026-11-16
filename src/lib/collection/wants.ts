import { eq, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { wants } from "@/db/schema";

export type WantDeck = {
  id: number;
  name: string;
  status: string;
  copies: number;
};
export type Want = {
  oracleId: string;
  name: string;
  imageSmall: string | null;
  /** Cheapest printing, US dollars. */
  priceUsd: number | null;
  /** Copies your decks need between them, and copies you own. */
  needed: number;
  owned: number;
  /** Copies you added to the want list yourself (on top of what decks need). */
  mine: number;
  /** How many to get: what the decks are short of, plus your own adds. */
  short: number;
  decks: WantDeck[];
};

/** How many to get when only some of the decks count (the page can leave out deck ideas). */
export function shortOf(
  w: Pick<Want, "owned" | "mine">,
  decks: WantDeck[],
): number {
  return (
    Math.max(0, decks.reduce((n, d) => n + d.copies, 0) - w.owned) + w.mine
  );
}

/**
 * One want list across every deck: cards your decks need more copies of than you own, with the
 * decks that want each one, plus cards you added yourself. Retired decks, cards you've marked to
 * proxy and basic lands are left out. Ideas count, but say so, since they're only plans. A few
 * queries, whatever the size of the collection.
 */
export async function wantList(db: Db): Promise<Want[]> {
  const rows = await db.all<{
    oracle_id: string;
    deck_id: number;
    deck_name: string;
    status: string;
    copies: number;
  }>(sql`
    SELECT dc.oracle_id, d.id AS deck_id, d.name AS deck_name, d.status, SUM(dc.quantity) AS copies
    FROM deck_cards dc JOIN decks d ON d.id = dc.deck_id
    WHERE dc.board IN ('main', 'commander') AND d.status != 'retired' AND (dc.acquire IS NULL OR dc.acquire != 'proxy')
      AND dc.oracle_id NOT LIKE 'basic:%'
    GROUP BY dc.oracle_id, d.id`);
  const mine = new Map(
    (await db.select().from(wants)).map((w) => [w.oracleId, w.quantity]),
  );
  if (!rows.length && !mine.size) return [];
  const byCard = new Map<string, WantDeck[]>();
  for (const r of rows)
    byCard.set(r.oracle_id, [
      ...(byCard.get(r.oracle_id) ?? []),
      {
        id: Number(r.deck_id),
        name: r.deck_name,
        status: r.status,
        copies: Number(r.copies),
      },
    ]);
  // What you own of those cards (proxies count, as everywhere in the app).
  const info = await db.all<{
    oracle_id: string;
    name: string;
    type_line: string;
    image_small: string | null;
    price_usd: number | null;
    owned: number;
  }>(sql`
    SELECT c.oracle_id, c.name, c.type_line, c.image_small, c.price_usd, COALESCE(o.owned, 0) AS owned
    FROM cards c
    LEFT JOIN (SELECT oracle_id, SUM(quantity) AS owned FROM collection_items GROUP BY oracle_id) o ON o.oracle_id = c.oracle_id
    WHERE c.oracle_id IN (SELECT dc.oracle_id FROM deck_cards dc JOIN decks d ON d.id = dc.deck_id
                          WHERE dc.board IN ('main', 'commander') AND d.status != 'retired'
                          UNION SELECT oracle_id FROM wants)`);
  const out: Want[] = [];
  for (const c of info) {
    const decks = (byCard.get(c.oracle_id) ?? []).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
    const own = mine.get(c.oracle_id) ?? 0;
    if (!own && (!decks.length || /\bBasic\b.*\bLand\b/.test(c.type_line)))
      continue;
    const owned = Number(c.owned);
    const w = { owned, mine: own };
    const short = shortOf(w, decks);
    if (short <= 0) continue;
    out.push({
      oracleId: c.oracle_id,
      name: c.name,
      imageSmall: c.image_small,
      priceUsd: c.price_usd == null ? null : Number(c.price_usd),
      needed: decks.reduce((n, d) => n + d.copies, 0),
      ...w,
      short,
      decks,
    });
  }
  // Your own adds first (you just asked for them), then wanted by the most decks, then the cheapest.
  return out.sort(
    (a, b) =>
      Number(b.mine > 0) - Number(a.mine > 0) ||
      b.decks.length - a.decks.length ||
      (a.priceUsd ?? 1e9) - (b.priceUsd ?? 1e9) ||
      a.name.localeCompare(b.name),
  );
}

/** Add copies of a card to the want list yourself (adds to any already there, up to 99). */
export async function addWant(
  db: Db,
  oracleId: string,
  quantity = 1,
  now = new Date(),
) {
  const [cur] = await db
    .select()
    .from(wants)
    .where(eq(wants.oracleId, oracleId));
  const q = Math.min(99, Math.max(1, (cur?.quantity ?? 0) + quantity));
  await db
    .insert(wants)
    .values({ oracleId, quantity: q, addedAt: now.toISOString() })
    .onConflictDoUpdate({ target: wants.oracleId, set: { quantity: q } });
  return q;
}

/** Take a card you added off the want list (decks that need it still list it). */
export async function removeWant(db: Db, oracleId: string) {
  const [row] = await db
    .delete(wants)
    .where(eq(wants.oracleId, oracleId))
    .returning();
  return row;
}
