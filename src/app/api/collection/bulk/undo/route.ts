import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { undoBulk } from "@/lib/collection/bulk";

export const runtime = "nodejs";

/** POST /api/collection/bulk/undo: put the last bulk change back. 409 when there's nothing to undo. */
export async function POST() {
  const ok = await undoBulk(await getDb());
  return NextResponse.json({ ok }, { status: ok ? 200 : 409 });
}
