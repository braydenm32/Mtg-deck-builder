import { NextResponse } from "next/server";
import { analysisInputs } from "@/app/decks/[id]/data";
import { getDb } from "@/db/client";
import { getDeck } from "@/lib/deck/store";
import { deckVersion } from "@/lib/deck/version";
import { getPriceView } from "@/lib/settings";

export const runtime = "nodejs";

/**
 * GET /api/decks/:id/snapshot -> the deck as its pages see it, with what its overview needs from
 * outside (combos), for the device to keep: when edits wait to be sent, the device draws the deck's
 * tabs from this and the edits (src/components/offline/DeviceDeck.tsx).
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number.parseInt((await params).id, 10);
  const v = Number.isFinite(id) ? await getDeck(await getDb(), id) : undefined;
  if (!v) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const [inputs, pv] = await Promise.all([analysisInputs(v), getPriceView()]);
  return NextResponse.json({ version: deckVersion(v), v, inputs, pv }, { headers: { "cache-control": "private, no-cache" } });
}
