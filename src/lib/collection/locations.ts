import { and, desc, eq, ne, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { collectionItems } from "@/db/schema";
import { moveItem } from "./service";

export type Place = { location: string; copies: number };

/**
 * Every box, binder or list that holds cards, with its copies, most first. Cards that need a home
 * (location "") are left out. Proxies count, since they sit somewhere too. Used to offer the places
 * you already have when you move a stack.
 */
export async function knownLocations(db: Db): Promise<Place[]> {
  const rows = await db
    .select({ location: collectionItems.location, copies: sql<number>`SUM(${collectionItems.quantity})` })
    .from(collectionItems)
    .where(ne(collectionItems.location, ""))
    .groupBy(collectionItems.location)
    .orderBy(desc(sql`SUM(${collectionItems.quantity})`), collectionItems.location);
  return rows.map((r) => ({ location: r.location, copies: Number(r.copies) }));
}

/**
 * Put every card that needs a home in one place: the stacks Today counts (no location, not a
 * proxy) move there, merging into identical stacks already in it. Decks keep their copies (see
 * moveItem). Returns how many copies moved.
 */
export async function giveAllAHome(db: Db, location: string): Promise<number> {
  const to = location.trim();
  if (!to) return 0;
  const stacks = await db
    .select({ id: collectionItems.id, quantity: collectionItems.quantity })
    .from(collectionItems)
    .where(and(eq(collectionItems.location, ""), eq(collectionItems.proxy, false)));
  let moved = 0;
  for (const s of stacks) {
    if ((await moveItem(db, s.id, to)) !== undefined) moved += s.quantity;
  }
  return moved;
}
