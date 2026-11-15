import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db/client";
import { importDecklist } from "@/lib/deck/store";

export const runtime = "nodejs";

const schema = z.object({
  text: z.string().min(1).max(200_000),
  commanderOracleId: z.string().min(1).optional(),
  name: z.string().max(120).optional(),
  status: z.enum(["idea", "building", "built", "retired"]).optional(),
});

/**
 * POST /api/decks/import { text, commanderOracleId?, name?, status? }
 * 201 { id, unmatched, cards } | 200 { reason: "no-commander", candidates, unmatched } | 400
 */
export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const r = await importDecklist(await getDb(), parsed.data.text, parsed.data);
  if (r.ok) return NextResponse.json({ id: r.deck.id, unmatched: r.unmatched, cards: r.cards }, { status: 201 });
  if (r.reason === "empty") return NextResponse.json({ error: "No cards found in that list" }, { status: 400 });
  // 200, not an error: the page asks which card is the commander and sends the list again.
  return NextResponse.json(r);
}
