import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { updateDeckCardSchema } from "@/lib/deck/schemas";
import { removeDeckCard, updateDeckCard } from "@/lib/deck/store";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string; cardId: string }> };
async function ids(p: Params["params"]) {
  const { id, cardId } = await p;
  const a = Number.parseInt(id, 10);
  const b = Number.parseInt(cardId, 10);
  return Number.isFinite(a) && Number.isFinite(b) ? { deckId: a, cardId: b } : undefined;
}

/** PATCH /api/decks/:id/cards/:cardId { locked?, board?, acquire?, quantity? } */
export async function PATCH(req: Request, { params }: Params) {
  const i = await ids(params);
  const parsed = updateDeckCardSchema.safeParse(await req.json().catch(() => null));
  if (!i || !parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  await updateDeckCard(await getDb(), i.deckId, i.cardId, parsed.data);
  return NextResponse.json({ ok: true });
}

/** DELETE returns the removed row so the page can offer Undo (POST it to /cards/restore). */
export async function DELETE(_req: Request, { params }: Params) {
  const i = await ids(params);
  if (!i) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  const row = await removeDeckCard(await getDb(), i.deckId, i.cardId);
  return row ? NextResponse.json({ removed: row }) : NextResponse.json({ error: "Not found" }, { status: 404 });
}
