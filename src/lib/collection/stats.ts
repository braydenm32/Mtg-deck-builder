import { sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { cards, collectionItems, printings } from "@/db/schema";
import { lastSync } from "@/lib/cards/sync";

export async function dashboardStats(db: Db) {
  const [cardCount] = await db.select({ n: sql<number>`count(*)` }).from(cards);
  const [printingCount] = await db.select({ n: sql<number>`count(*)` }).from(printings);
  const [owned] = await db
    .select({
      copies: sql<number>`COALESCE(SUM(${collectionItems.quantity}), 0)`,
      unique: sql<number>`COUNT(DISTINCT ${collectionItems.oracleId})`,
    })
    .from(collectionItems);
  return {
    cards: Number(cardCount.n),
    printings: Number(printingCount.n),
    ownedCopies: Number(owned.copies),
    ownedUnique: Number(owned.unique),
    lastSync: await lastSync(db),
  };
}
