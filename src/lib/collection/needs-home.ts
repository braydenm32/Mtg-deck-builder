import { and, desc, eq, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { cards, collectionItems } from "@/db/schema";

export type NeedsAHome = {
  /** Copies with no box, binder or list. */
  copies: number;
  /** How many different cards those copies are. */
  cardCount: number;
  /** The first few of those cards, most recently added first. */
  cards: { oracleId: string; name: string; imageSmall: string | null; copies: number }[];
};

/**
 * Cards waiting for a home: stacks with no location (`location = ''`), counted in copies.
 * Proxies aren't counted. This is Today's "N cards need a home" in docs/design/3-numbers-audit.md
 * (Part B, "1. Today"; check query N6). Read-only.
 */
export async function cardsNeedingAHome(db: Db, limit = 12): Promise<NeedsAHome> {
  const homeless = and(eq(collectionItems.location, ""), eq(collectionItems.proxy, false));
  const [total] = await db
    .select({
      copies: sql<number>`COALESCE(SUM(${collectionItems.quantity}), 0)`,
      cardCount: sql<number>`COUNT(DISTINCT ${collectionItems.oracleId})`,
    })
    .from(collectionItems)
    .where(homeless);
  const copies = Number(total?.copies ?? 0);
  if (copies === 0) return { copies: 0, cardCount: 0, cards: [] };
  const rows = await db
    .select({
      oracleId: collectionItems.oracleId,
      name: cards.name,
      imageSmall: cards.imageSmall,
      copies: sql<number>`SUM(${collectionItems.quantity})`,
      addedAt: sql<string>`MAX(${collectionItems.addedAt})`,
    })
    .from(collectionItems)
    .innerJoin(cards, eq(cards.oracleId, collectionItems.oracleId))
    .where(homeless)
    .groupBy(collectionItems.oracleId)
    .orderBy(desc(sql`MAX(${collectionItems.addedAt})`), cards.name)
    .limit(limit);
  return {
    copies,
    cardCount: Number(total?.cardCount ?? 0),
    cards: rows.map((r) => ({ oracleId: r.oracleId, name: r.name, imageSmall: r.imageSmall, copies: Number(r.copies) })),
  };
}
