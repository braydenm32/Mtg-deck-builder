import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { customCardSchema, deleteCustomCard, updateCustomCard } from "@/lib/cards/custom";

export const runtime = "nodejs";

type Params = { params: Promise<{ oracleId: string }> };

/** PATCH /api/cards/custom/:oracleId { name, manaCost?, typeLine, oracleText? } */
export async function PATCH(req: Request, { params }: Params) {
  const { oracleId } = await params;
  const parsed = customCardSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "A card needs a name and a type line." }, { status: 400 });
  const res = await updateCustomCard(await getDb(), oracleId, parsed.data);
  return "error" in res ? NextResponse.json(res, { status: 400 }) : NextResponse.json(res);
}

/** DELETE /api/cards/custom/:oracleId -> { removedFromDecks } (the card leaves every deck too), or { error } (409) while it leads a deck. */
export async function DELETE(_req: Request, { params }: Params) {
  const { oracleId } = await params;
  const res = await deleteCustomCard(await getDb(), oracleId);
  if (!res) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return "error" in res ? NextResponse.json(res, { status: 409 }) : NextResponse.json(res);
}
