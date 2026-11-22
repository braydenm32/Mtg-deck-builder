import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { deckTokens } from "@/lib/deck/tokens";

export const runtime = "nodejs";

/** GET /api/decks/:id/tokens -> { tokens: DeckToken[], unknown } (see src/lib/deck/tokens.ts). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number.parseInt((await params).id, 10);
  if (!Number.isFinite(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  return NextResponse.json(await deckTokens(await getDb(), id, { fetchMissing: true }));
}
