import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { compareWithAverage } from "@/lib/deck/average";

export const runtime = "nodejs";

/** GET /api/decks/:id/average: the deck beside EDHREC's average deck for its commander. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number.parseInt((await params).id, 10);
  const result = Number.isFinite(id) ? await compareWithAverage(await getDb(), id) : undefined;
  if (!result) return NextResponse.json({ error: "Deck not found" }, { status: 404 });
  return NextResponse.json(result);
}
