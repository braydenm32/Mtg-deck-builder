import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db/client";
import { cards } from "@/db/schema";
import { addWant, removeWant, wantList } from "@/lib/collection/wants";

export const runtime = "nodejs";

const body = z.object({ oracleId: z.string().min(1).max(64), quantity: z.number().int().min(1).max(99).default(1) });

/** GET /api/wants -> the want list (see src/lib/collection/wants.ts). */
export async function GET() {
  return NextResponse.json({ wants: await wantList(await getDb()) });
}

/** POST /api/wants { oracleId, quantity? } adds copies you want; DELETE /api/wants { oracleId } takes your adds off. */
export async function POST(req: Request) {
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const db = await getDb();
  const [card] = await db.select({ name: cards.name }).from(cards).where(eq(cards.oracleId, parsed.data.oracleId));
  if (!card) return NextResponse.json({ error: "Card not found" }, { status: 404 });
  const quantity = await addWant(db, parsed.data.oracleId, parsed.data.quantity);
  return NextResponse.json({ name: card.name, quantity });
}

export async function DELETE(req: Request) {
  const parsed = body.pick({ oracleId: true }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const row = await removeWant(await getDb(), parsed.data.oracleId);
  return NextResponse.json({ removed: row ?? null });
}
