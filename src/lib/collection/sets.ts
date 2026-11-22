import { sql } from "drizzle-orm";
import type { Db } from "@/db/client";

/**
 * Set completion: for each set you own a card from, how many of its cards (by collector number) you
 * have, out of how many it has. Read with the printings' (set, number) index, only for your sets.
 */

/** Set types that aren't a set you'd collect: tokens, art cards, oversized and digital-only. */
const SIDE_TYPES = ["token", "memorabilia", "minigame", "alchemy", "treasure_chest", "vanguard"];

export type SetProgress = { code: string; name: string; type: string; releasedAt: string | null; owned: number; total: number; share: number };

export async function setProgress(db: Db, opts: { all?: boolean } = {}): Promise<SetProgress[]> {
  const owned = await db.all<{ set_code: string; set_name: string; set_type: string; released_at: string | null; owned: number }>(sql`
    SELECT p.set_code, MAX(p.set_name) AS set_name, MAX(p.set_type) AS set_type, MAX(p.released_at) AS released_at, COUNT(DISTINCT p.collector_number) AS owned
    FROM collection_items ci JOIN printings p ON p.id = ci.printing_id
    WHERE ci.proxy = 0
    GROUP BY p.set_code`);
  const sets = owned.filter((s) => opts.all || !SIDE_TYPES.includes(s.set_type));
  if (!sets.length) return [];
  const totals = new Map<string, number>();
  for (let i = 0; i < sets.length; i += 300) {
    const codes = sets.slice(i, i + 300).map((s) => s.set_code);
    const rows = await db.all<{ set_code: string; total: number }>(sql`
      SELECT set_code, COUNT(DISTINCT collector_number) AS total FROM printings
      WHERE set_code IN (${sql.join(codes.map((c) => sql`${c}`), sql`, `)})
      GROUP BY set_code`);
    for (const r of rows) totals.set(r.set_code, Number(r.total));
  }
  return sets
    .map((s) => {
      const total = Math.max(totals.get(s.set_code) ?? 0, Number(s.owned));
      return { code: s.set_code, name: s.set_name, type: s.set_type, releasedAt: s.released_at, owned: Number(s.owned), total, share: total ? Number(s.owned) / total : 0 };
    })
    .sort((a, b) => b.share - a.share || b.owned - a.owned || a.name.localeCompare(b.name));
}

export type SetCard = { collectorNumber: string; name: string; oracleId: string; rarity: string; imageSmall: string | null; owned: number };

/** "12" < "12a" < "100" < "★1": by the number, then the rest. */
export function byCollectorNumber(a: string, b: string): number {
  const na = Number.parseInt(a, 10);
  const nb = Number.parseInt(b, 10);
  if (Number.isNaN(na) !== Number.isNaN(nb)) return Number.isNaN(na) ? 1 : -1;
  return (Number.isNaN(na) ? 0 : na - nb) || a.localeCompare(b);
}

/** Every card in a set, in collector-number order, with how many copies you own of each. */
export async function setCards(db: Db, code: string): Promise<{ name: string; cards: SetCard[] } | undefined> {
  const rows = await db.all<{ collector_number: string; name: string; oracle_id: string; rarity: string; image_small: string | null; set_name: string; lang: string; owned: number }>(sql`
    SELECT p.collector_number, p.name, p.oracle_id, p.rarity, p.image_small, p.set_name, p.lang,
      (SELECT COALESCE(SUM(ci.quantity), 0) FROM collection_items ci JOIN printings q ON q.id = ci.printing_id
       WHERE q.set_code = p.set_code AND q.collector_number = p.collector_number AND ci.proxy = 0) AS owned
    FROM printings p WHERE p.set_code = ${code.toLowerCase()}`);
  if (!rows.length) return undefined;
  // One row per collector number, English first.
  const by = new Map<string, (typeof rows)[number]>();
  for (const r of rows) if (!by.has(r.collector_number) || r.lang === "en") by.set(r.collector_number, r);
  const cards = [...by.values()]
    .map((r) => ({ collectorNumber: r.collector_number, name: r.name, oracleId: r.oracle_id, rarity: r.rarity, imageSmall: r.image_small, owned: Number(r.owned) }))
    .sort((a, b) => byCollectorNumber(a.collectorNumber, b.collectorNumber));
  return { name: rows[0].set_name, cards };
}
