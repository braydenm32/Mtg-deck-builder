import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db/client";
import { addPackageToDeck, undoPackageAdd, undoSchema } from "@/lib/deck/packages";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

/** POST /api/packages/:id/deck { deckId }: put the package in that deck. Returns what was added and skipped, and what Undo needs. */
export async function POST(req: Request, { params }: Ctx) {
  const id = Number.parseInt((await params).id, 10);
  const parsed = z.object({ deckId: z.number().int() }).safeParse(await req.json().catch(() => null));
  if (!Number.isFinite(id) || !parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const r = await addPackageToDeck(await getDb(), id, parsed.data.deckId);
  if (!r) return NextResponse.json({ error: "Package or deck not found" }, { status: 404 });
  return NextResponse.json(r);
}

/** DELETE /api/packages/:id/deck { deckId, undo }: take it back out (Undo). */
export async function DELETE(req: Request) {
  const parsed = z.object({ deckId: z.number().int(), undo: undoSchema }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  await undoPackageAdd(await getDb(), parsed.data.deckId, parsed.data.undo);
  return new NextResponse(null, { status: 204 });
}
