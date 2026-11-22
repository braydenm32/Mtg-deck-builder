import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { updateDeckSchema } from "@/lib/deck/schemas";
import { deleteDeck, getDeck, updateDeck } from "@/lib/deck/store";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };
const deckId = async (p: Params["params"]) => {
  const n = Number.parseInt((await p).id, 10);
  return Number.isFinite(n) ? n : undefined;
};

export async function GET(_req: Request, { params }: Params) {
  const id = await deckId(params);
  const v = id ? await getDeck(await getDb(), id) : undefined;
  return v ? NextResponse.json(v) : NextResponse.json({ error: "Not found" }, { status: 404 });
}

/** PATCH /api/decks/:id { name?, notes?, theme?, status?, settings?, folder?, pinned? } (settings are merged) */
export async function PATCH(req: Request, { params }: Params) {
  const id = await deckId(params);
  const parsed = updateDeckSchema.safeParse(await req.json().catch(() => null));
  if (!id || !parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const db = await getDb();
  if (!(await getDeck(db, id))) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await updateDeck(db, id, parsed.data);
  return NextResponse.json({ ok: true });
}

/** Deleting is permanent; the UI offers "Retire" first, which keeps the list. */
export async function DELETE(_req: Request, { params }: Params) {
  const id = await deckId(params);
  if (!id) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  await deleteDeck(await getDb(), id);
  return new NextResponse(null, { status: 204 });
}
