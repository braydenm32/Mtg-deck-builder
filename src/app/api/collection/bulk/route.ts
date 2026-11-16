import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { applyBulk, previewBulk } from "@/lib/collection/bulk";
import { bulkRequestSchema } from "@/lib/collection/bulk-schema";
import { matchingStackIds, parseFilters } from "@/lib/collection/query";

export const runtime = "nodejs";

/** POST /api/collection/bulk: move, set condition, mark proxy or remove the stacks a view shows. See bulk-schema.ts. */
export async function POST(req: Request) {
  const parsed = bulkRequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const { query, oracleIds, action, preview } = parsed.data;
  const db = await getDb();
  const ids = await matchingStackIds(db, parseFilters(Object.fromEntries(new URLSearchParams(query))), oracleIds);
  const result = preview ? await previewBulk(db, ids) : await applyBulk(db, ids, action);
  return NextResponse.json(result);
}
