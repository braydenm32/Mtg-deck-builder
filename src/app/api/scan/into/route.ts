import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db/client";
import { cards } from "@/db/schema";
import { scanIntoDeck, scanIntoWants, undoScanIntoDeck, undoScanIntoWants } from "@/lib/scan-into";

export const runtime = "nodejs";

const id = z.number().int().positive();
const oracleId = z.string().min(1).max(64);
const add = z.discriminatedUnion("kind", [z.object({ kind: z.literal("deck"), deckId: id, oracleId }), z.object({ kind: z.literal("wants"), oracleId })]);
const undo = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("deck"), deckId: id, cardId: id }),
  z.object({ kind: z.literal("wants"), oracleId, previous: z.number().int().min(0).max(99) }),
]);

/**
 * POST /api/scan/into { kind: "deck", deckId, oracleId } | { kind: "wants", oracleId }
 * Sends a scanned card to a deck (after it joined the collection) or to the want list (instead).
 * -> { cardId, deck } | { previous, quantity }, which DELETE takes to undo it.
 */
export async function POST(req: Request) {
  const parsed = add.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const db = await getDb();
  const [card] = await db.select({ name: cards.name }).from(cards).where(eq(cards.oracleId, parsed.data.oracleId));
  if (!card) return NextResponse.json({ error: "Card not found" }, { status: 404 });
  if (parsed.data.kind === "wants") return NextResponse.json(await scanIntoWants(db, parsed.data.oracleId));
  const r = await scanIntoDeck(db, parsed.data.deckId, parsed.data.oracleId);
  return r ? NextResponse.json(r) : NextResponse.json({ error: "That deck is gone" }, { status: 404 });
}

export async function DELETE(req: Request) {
  const parsed = undo.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const db = await getDb();
  if (parsed.data.kind === "wants") await undoScanIntoWants(db, parsed.data.oracleId, parsed.data.previous);
  else await undoScanIntoDeck(db, parsed.data.deckId, parsed.data.cardId);
  return NextResponse.json({ ok: true });
}
