import { sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { normName } from "@/lib/cards/normalize";
import { STATUS_LABEL, type DeckStatus } from "@/lib/deck/store";

export type QuickResult = {
  decks: { id: number; name: string; commander: string; status: string }[];
  cards: { oracleId: string; name: string; typeLine: string; copies: number; proxies: number }[];
};

/**
 * What ⌘K finds on the server: your decks (by name or commander) and the cards you own (by name).
 * Names that start with the query come first. The full Collection search (rules text, type) is
 * one more result in the palette, "Search the collection for …".
 */
export async function quickSearch(db: Db, query: string, limit = 6): Promise<QuickResult> {
  const q = query.trim();
  const n = normName(q);
  if (!n) return { decks: [], cards: [] };
  const like = `%${n}%`;
  const starts = `${n}%`;
  const deckRows = await db.all<{ id: number; name: string; commander: string | null; status: string }>(sql`
    SELECT d.id, d.name, c.name AS commander, d.status
    FROM decks d
    LEFT JOIN cards c ON c.oracle_id = d.commander_oracle_id
    WHERE instr(lower(d.name), ${q.toLowerCase()}) > 0 OR c.norm_name LIKE ${like}
    ORDER BY (d.status = 'retired'), (instr(lower(d.name), ${q.toLowerCase()}) = 1) DESC, d.updated_at DESC
    LIMIT ${limit}`);
  const cardRows = await db.all<{ oracle_id: string; name: string; type_line: string; copies: number; proxies: number }>(sql`
    SELECT c.oracle_id, c.name, c.type_line,
           SUM(ci.quantity) AS copies,
           SUM(CASE WHEN ci.proxy THEN ci.quantity ELSE 0 END) AS proxies
    FROM collection_items ci
    JOIN cards c ON c.oracle_id = ci.oracle_id
    WHERE c.norm_name LIKE ${like}
    GROUP BY c.oracle_id
    ORDER BY (c.norm_name LIKE ${starts}) DESC, c.name
    LIMIT ${limit}`);
  return {
    decks: deckRows.map((d) => ({
      id: Number(d.id),
      name: String(d.name),
      commander: d.commander ?? "",
      status: STATUS_LABEL[d.status as DeckStatus] ?? d.status,
    })),
    cards: cardRows.map((c) => ({
      oracleId: String(c.oracle_id),
      name: String(c.name),
      typeLine: String(c.type_line),
      copies: Number(c.copies),
      proxies: Number(c.proxies),
    })),
  };
}
