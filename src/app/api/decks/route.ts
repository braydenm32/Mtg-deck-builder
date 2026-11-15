import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { createDeckSchema } from "@/lib/deck/schemas";
import { createDeck, listDecks, rebuildDeck } from "@/lib/deck/store";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ decks: await listDecks(await getDb()) });
}

/** POST /api/decks { commanderOracleId, theme?, name?, settings? } -> builds the deck and returns { id, warnings } */
export async function POST(req: Request) {
  const parsed = createDeckSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request", issues: parsed.error.issues }, { status: 400 });
  const db = await getDb();
  try {
    const deck = await createDeck(db, parsed.data);
    const result = await rebuildDeck(db, deck.id);
    return NextResponse.json({ id: deck.id, warnings: result.warnings }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
