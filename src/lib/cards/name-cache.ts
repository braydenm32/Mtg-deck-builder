import { eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { cards, meta } from "@/db/schema";

/**
 * Every card's name and the few fields autocomplete filters on, held in memory per server.
 *
 * Name search matches anywhere in a name ("bolt" finds Lightning Bolt), which no index can serve,
 * so in SQL every keystroke read all ~40,000 cards. On a hosted database that bills rows read
 * (Turso), that adds up fast; here it's one read per server start, refreshed every 10 minutes.
 */
export type NameRow = {
  oracleId: string;
  name: string;
  normName: string;
  typeLine: string;
  imageSmall: string | null;
  colorIdentity: string;
  layout: string;
  canBeCommander: boolean;
  legalCommander: string;
  edhrecRank: number | null;
};

const TTL_MS = 10 * 60 * 1000;
let cache = new WeakMap<Db, { at: number; rows: Promise<NameRow[]> }>();

export function cardNameRows(db: Db): Promise<NameRow[]> {
  const hit = cache.get(db);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.rows;
  const rows = db
    .select({
      oracleId: cards.oracleId,
      name: cards.name,
      normName: cards.normName,
      typeLine: cards.typeLine,
      imageSmall: cards.imageSmall,
      colorIdentity: cards.colorIdentity,
      layout: cards.layout,
      canBeCommander: cards.canBeCommander,
      legalCommander: cards.legalCommander,
      edhrecRank: cards.edhrecRank,
    })
    .from(cards)
    .then((list) => {
      // Most popular first (EDHREC rank, unranked last), so a search can stop at its limit.
      list.sort((a, b) => (a.edhrecRank ?? Infinity) - (b.edhrecRank ?? Infinity));
      // Before the first card sync there's nothing to keep; look again next time.
      if (!list.length) cache.delete(db);
      return list;
    });
  rows.catch(() => cache.delete(db));
  cache.set(db, { at: Date.now(), rows });
  return rows;
}

/** Forget the cached names (after a sync, or when cards fetched live are stored). */
export function clearCardNameRows() {
  cache = new WeakMap();
}

/**
 * The catalogue's size (Commander-legal paper cards, and printings), counted once after each sync:
 * counting them on every Today visit read every row of both tables.
 */
export async function catalogCounts(db: Db): Promise<{ cards: number; printings: number }> {
  const [row] = await db.select().from(meta).where(eq(meta.key, CATALOG_KEY));
  if (row) {
    try {
      return JSON.parse(row.value) as { cards: number; printings: number };
    } catch {
      // Recount below.
    }
  }
  return recountCatalog(db);
}

const CATALOG_KEY = "catalog:counts";

export async function recountCatalog(db: Db): Promise<{ cards: number; printings: number }> {
  const [c] = await db.$client.execute("SELECT count(*) AS n FROM cards WHERE legal_commander = 'legal' AND paper = 1").then((r) => r.rows);
  const [p] = await db.$client.execute("SELECT count(*) AS n FROM printings").then((r) => r.rows);
  const counts = { cards: Number(c.n), printings: Number(p.n) };
  // An empty catalogue isn't stored: the first sync will count it.
  if (counts.printings > 0) {
    const value = JSON.stringify(counts);
    await db.insert(meta).values({ key: CATALOG_KEY, value }).onConflictDoUpdate({ target: meta.key, set: { value } });
  }
  return counts;
}
