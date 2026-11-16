import { NextResponse } from "next/server";
import { and, gte, lt, notInArray } from "drizzle-orm";
import { getDb } from "@/db/client";
import { cards } from "@/db/schema";
import { DETAIL_FIELDS, detailRow } from "@/lib/cards/details";
import { NON_DECK_LAYOUTS } from "@/lib/cards/rows";
import { lastSync } from "@/lib/cards/sync";

export const runtime = "nodejs";

const HEX = "0123456789abcdef";

/**
 * GET /api/cards/details/:shard -> { fields, rows }: every card you can put in a deck whose oracle id
 * starts with :shard (0-f), with what the deck modules need, so the device can work out a deck's
 * numbers for a card added offline. Sixteen shards of about 0.2 MB each (gzipped); tagged with the
 * last card sync, so an unchanged shard answers 304.
 */
export async function GET(req: Request, { params }: { params: Promise<{ shard: string }> }) {
  const shard = (await params).shard;
  if (shard.length !== 1 || !HEX.includes(shard)) return NextResponse.json({ error: "Invalid shard" }, { status: 400 });
  const db = await getDb();
  const etag = `"${shard}-${(await lastSync(db)) ?? "none"}"`;
  const headers = { etag, "cache-control": "private, no-cache" };
  if (req.headers.get("if-none-match") === etag) return new NextResponse(null, { status: 304, headers });
  const next = HEX[HEX.indexOf(shard) + 1];
  const list = await db
    .select()
    .from(cards)
    .where(and(gte(cards.oracleId, shard), next ? lt(cards.oracleId, next) : undefined, notInArray(cards.layout, NON_DECK_LAYOUTS)));
  return NextResponse.json({ fields: DETAIL_FIELDS, rows: list.map(detailRow) }, { headers });
}
