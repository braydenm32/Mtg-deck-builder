import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { addDeckCardSchema } from "@/lib/deck/schemas";
import { addDeckCard } from "@/lib/deck/store";

export const runtime = "nodejs";

/** POST /api/decks/:id/cards { oracleId, board?, acquire? } - hand-added cards are locked. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number.parseInt((await params).id, 10);
  const parsed = addDeckCardSchema.safeParse(await req.json().catch(() => null));
  if (!Number.isFinite(id) || !parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  try {
    await addDeckCard(await getDb(), id, parsed.data.oracleId, parsed.data);
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 404 });
  }
}
