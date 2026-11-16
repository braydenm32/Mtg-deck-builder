import { sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { STACK_PRICE } from "./query";

/** Stacks you've put on the for-trade list (tagged "trade"), priciest first, with what each copy is worth. */
export type ForTrade = { itemId: number; oracleId: string; name: string; setCode: string; collectorNumber: string; finish: string; quantity: number; location: string; priceUsd: number | null; imageSmall: string | null };

export async function forTradeList(db: Db): Promise<ForTrade[]> {
  const rows = await db.all<Record<string, unknown>>(sql`
    SELECT ci.id, ci.oracle_id, c.name, p.set_code, p.collector_number, ci.finish, ci.quantity, ci.location, (${STACK_PRICE}) AS price, p.image_small
    FROM collection_items ci
    JOIN cards c ON c.oracle_id = ci.oracle_id
    JOIN printings p ON p.id = ci.printing_id
    WHERE ci.tags IS NOT NULL AND EXISTS (SELECT 1 FROM json_each(ci.tags) WHERE lower(json_each.value) = 'trade')
    ORDER BY price DESC NULLS LAST, c.name`);
  return rows.map((r) => ({
    itemId: Number(r.id),
    oracleId: String(r.oracle_id),
    name: String(r.name),
    setCode: String(r.set_code),
    collectorNumber: String(r.collector_number),
    finish: String(r.finish),
    quantity: Number(r.quantity),
    location: String(r.location ?? ""),
    priceUsd: r.price == null ? null : Number(r.price),
    imageSmall: (r.image_small as string | null) ?? null,
  }));
}
