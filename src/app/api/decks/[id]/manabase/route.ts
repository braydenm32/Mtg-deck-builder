import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db/client";
import { manaBase, swapBasicFor, undoBasicSwap, type BasicSwap } from "@/lib/deck/manabase";

export const runtime = "nodejs";

const idOf = async (params: Promise<{ id: string }>) => Number.parseInt((await params).id, 10);

/** GET /api/decks/:id/manabase: the basics split and the free lands you own that fit. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = await idOf(params);
  const result = Number.isFinite(id) ? await manaBase(await getDb(), id) : undefined;
  if (!result) return NextResponse.json({ error: "Deck not found" }, { status: 404 });
  return NextResponse.json(result);
}

const body = z.union([
  z.object({ cutRowId: z.number().int(), inOracleId: z.string().min(1) }),
  z.object({ undo: z.object({ cutRowId: z.number().int(), was: z.number().int().min(1), removed: z.any().optional(), inOracleId: z.string().min(1) }) }),
]);

/** POST { cutRowId, inOracleId } swaps one basic for the land; POST { undo } puts it back. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = await idOf(params);
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!Number.isFinite(id) || !parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const db = await getDb();
  if ("undo" in parsed.data) {
    await undoBasicSwap(db, id, parsed.data.undo as BasicSwap);
    return NextResponse.json({ ok: true });
  }
  try {
    const swap = await swapBasicFor(db, id, parsed.data.cutRowId, parsed.data.inOracleId);
    if (!swap) return NextResponse.json({ error: "That basic isn’t in the deck" }, { status: 404 });
    return NextResponse.json({ swap });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 404 });
  }
}
