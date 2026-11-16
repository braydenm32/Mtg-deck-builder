import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { getBatch } from "@/lib/collection/import";

export const runtime = "nodejs";

/** GET /api/import/:id -> { batch, result, misses, open } (result is null for imports made before results were kept) */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number.parseInt((await params).id, 10);
  const b = Number.isFinite(id) ? await getBatch(await getDb(), id) : undefined;
  if (!b) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { snapshot: _snapshot, ...batch } = b.batch;
  void _snapshot;
  return NextResponse.json({ ...b, batch });
}
