import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { moveCardToDeck, sharedCards } from "@/lib/deck/allocate";
import { moveSharedSchema } from "@/lib/deck/schemas";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ shared: await sharedCards(await getDb()) });
}

/** POST /api/decks/shared { oracleId, deckId } - give the card to that deck; decks still being built are rebuilt. */
export async function POST(req: Request) {
  const parsed = moveSharedSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  return NextResponse.json(await moveCardToDeck(await getDb(), parsed.data.oracleId, parsed.data.deckId));
}
