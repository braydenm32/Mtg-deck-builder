import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { createCustomCard, customCardSchema, listCustomCards } from "@/lib/cards/custom";

export const runtime = "nodejs";

/** GET /api/cards/custom -> { cards } (the cards you made up). */
export async function GET() {
  return NextResponse.json({ cards: await listCustomCards(await getDb()) });
}

/** POST /api/cards/custom { name, manaCost?, typeLine, oracleText? } -> { oracleId } or { error } (400). */
export async function POST(req: Request) {
  const parsed = customCardSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "A card needs a name and a type line." }, { status: 400 });
  const res = await createCustomCard(await getDb(), parsed.data);
  return "error" in res ? NextResponse.json(res, { status: 400 }) : NextResponse.json(res, { status: 201 });
}
