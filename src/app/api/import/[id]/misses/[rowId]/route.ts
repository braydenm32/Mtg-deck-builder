import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db/client";
import { resolveMiss } from "@/lib/collection/import";

export const runtime = "nodejs";

const body = z.object({ resolution: z.enum(["added", "not-owned"]).nullable() });

/**
 * PATCH /api/import/:id/misses/:rowId { resolution: "added" | "not-owned" | null }
 * Marks a row the import couldn't match as dealt with, or (null) opens it again. Returns the row.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string; rowId: string }> }) {
  const p = await params;
  const batchId = Number.parseInt(p.id, 10);
  const rowId = Number.parseInt(p.rowId, 10);
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!Number.isFinite(batchId) || !Number.isFinite(rowId) || !parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const row = await resolveMiss(await getDb(), batchId, rowId, parsed.data.resolution);
  return row ? NextResponse.json(row) : NextResponse.json({ error: "Not found" }, { status: 404 });
}
