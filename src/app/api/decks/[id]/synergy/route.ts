import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { synergySuggestions } from "@/lib/deck/synergy-data";

export const runtime = "nodejs";

/** GET /api/decks/:id/synergy -> { owned, toGet, edhrec }: cards that fit the deck's mechanics (src/lib/deck/synergy-data.ts). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number.parseInt((await params).id, 10);
  const found = Number.isFinite(id) ? await synergySuggestions(await getDb(), id) : undefined;
  return found ? NextResponse.json(found) : NextResponse.json({ error: "Not found" }, { status: 404 });
}
