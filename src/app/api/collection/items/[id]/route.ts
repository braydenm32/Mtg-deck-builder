import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { getItem, moveItem, removeItem, setQuantity } from "@/lib/collection/service";
import { updateItemSchema } from "@/lib/collection/schemas";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

async function itemId(params: Params["params"]) {
  const id = Number.parseInt((await params).id, 10);
  return Number.isFinite(id) ? id : undefined;
}

/**
 * PATCH /api/collection/items/:id
 * - { "quantity": 3 } sets the stack's size (0 removes it)
 * - { "location": "Binder 2", "moveQuantity"?: 1 } moves copies (all by default); returns the stack they're in now
 */
export async function PATCH(req: Request, { params }: Params) {
  const id = await itemId(params);
  const parsed = updateItemSchema.safeParse(await req.json().catch(() => null));
  if (!id || !parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const db = await getDb();
  if (!(await getItem(db, id))) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if ("location" in parsed.data) {
    const to = await moveItem(db, id, parsed.data.location, parsed.data.moveQuantity);
    return NextResponse.json(to ? await getItem(db, to) : { error: "Not found" }, { status: to ? 200 : 404 });
  }
  await setQuantity(db, id, parsed.data.quantity);
  return NextResponse.json((await getItem(db, id)) ?? { id, removed: true });
}

export async function DELETE(_req: Request, { params }: Params) {
  const id = await itemId(params);
  if (!id) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  const db = await getDb();
  await removeItem(db, id);
  return new NextResponse(null, { status: 204 });
}
