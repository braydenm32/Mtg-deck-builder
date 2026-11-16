import { sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { collectionItems } from "@/db/schema";
import { catalogCounts } from "@/lib/cards/name-cache";
import { lastSync } from "@/lib/cards/sync";

export async function dashboardStats(db: Db) {
  const catalog = await catalogCounts(db);
  const [owned] = await db
    .select({
      copies: sql<number>`COALESCE(SUM(${collectionItems.quantity}), 0)`,
      unique: sql<number>`COUNT(DISTINCT ${collectionItems.oracleId})`,
    })
    .from(collectionItems);
  return {
    /** Commander-legal paper cards known to the app (excludes tokens, art cards, digital-only cards). */
    cards: catalog.cards,
    printings: catalog.printings,
    ownedCopies: Number(owned.copies),
    ownedUnique: Number(owned.unique),
    lastSync: await lastSync(db),
  };
}
