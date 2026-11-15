import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db/client";
import { restoreDeckCard } from "@/lib/deck/store";

export const runtime = "nodejs";

const rowSchema = z.object({
  id: z.number().int(),
  deckId: z.number().int(),
  oracleId: z.string(),
  quantity: z.number().int().min(1),
  board: z.string(),
  role: z.string(),
  acquire: z.string().nullable(),
  collectionItemId: z.number().int().nullable(),
  locked: z.boolean(),
  addedBy: z.string(),
  score: z.number().nullable(),
  synergy: z.number().nullable(),
  reason: z.string(),
});

/** POST /api/decks/:id/cards/restore { removed } - undo a removal. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number.parseInt((await params).id, 10);
  const parsed = z.object({ removed: rowSchema }).safeParse(await req.json().catch(() => null));
  if (!parsed.success || parsed.data.removed.deckId !== id) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  await restoreDeckCard(await getDb(), parsed.data.removed);
  return NextResponse.json({ ok: true });
}
