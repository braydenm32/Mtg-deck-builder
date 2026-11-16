import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db/client";
import { applySwap, collectionSwaps, undoSwap } from "@/lib/deck/swaps";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };
const deckId = async (p: Params["params"]) => {
  const n = Number.parseInt((await p).id, 10);
  return Number.isFinite(n) ? n : undefined;
};

/** GET /api/decks/:id/swaps -> { swaps }: cards you own that would beat the deck's weakest (see src/lib/deck/swaps.ts). */
export async function GET(_req: Request, { params }: Params) {
  const id = await deckId(params);
  const swaps = id ? await collectionSwaps(await getDb(), id) : undefined;
  return swaps ? NextResponse.json({ swaps }) : NextResponse.json({ error: "Not found" }, { status: 404 });
}

const removedRow = z.looseObject({ id: z.number().int(), deckId: z.number().int(), oracleId: z.string(), board: z.string() });
const body = z.union([
  z.object({ outId: z.number().int(), inOracleId: z.string().min(1) }),
  z.object({ undo: z.object({ removed: removedRow, inOracleId: z.string().min(1) }) }),
]);

/** POST { outId, inOracleId } makes a swap -> { removed }; POST { undo: { removed, inOracleId } } takes it back. */
export async function POST(req: Request, { params }: Params) {
  const id = await deckId(params);
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!id || !parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const db = await getDb();
  if ("undo" in parsed.data) {
    await undoSwap(db, id, parsed.data.undo.removed as never, parsed.data.undo.inOracleId);
    return NextResponse.json({ ok: true });
  }
  const removed = await applySwap(db, id, parsed.data.outId, parsed.data.inOracleId).catch(() => undefined);
  return removed ? NextResponse.json({ removed }) : NextResponse.json({ error: "That card isn't in the deck any more" }, { status: 409 });
}
