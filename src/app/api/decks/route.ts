import { NextResponse } from "next/server";
import { desc } from "drizzle-orm";
import { getDb } from "@/db/client";
import { decks } from "@/db/schema";
import { createDeckSchema } from "@/lib/deck/schemas";
import { createDeck, listDecks, rebuildDeck } from "@/lib/deck/store";

export const runtime = "nodejs";

/** GET /api/decks -> every deck in full; ?names=1 -> just { id, name, status } of each, newest first (for picking one). */
export async function GET(req: Request) {
  const db = await getDb();
  if (new URL(req.url).searchParams.get("names") === "1") {
    const rows = await db.select({ id: decks.id, name: decks.name, status: decks.status }).from(decks).orderBy(desc(decks.pinned), desc(decks.updatedAt));
    return NextResponse.json({ decks: rows });
  }
  return NextResponse.json({ decks: await listDecks(db) });
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
