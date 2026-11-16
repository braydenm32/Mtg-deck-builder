import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db/client";
import { restoreVersion } from "@/lib/deck/history";
import { placeCopies } from "@/lib/deck/store";

export const runtime = "nodejs";

/** POST /api/decks/:id/history { versionId }: put that version back. Returns the version kept from before, for Undo. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number.parseInt((await params).id, 10);
  const parsed = z.object({ versionId: z.number().int() }).safeParse(await req.json().catch(() => null));
  if (!Number.isFinite(id) || !parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const before = await restoreVersion(await getDb(), id, parsed.data.versionId, placeCopies);
  if (before === undefined) return NextResponse.json({ error: "Version not found" }, { status: 404 });
  return NextResponse.json({ before });
}
