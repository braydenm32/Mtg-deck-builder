import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db/client";
import { logGame, logGameSchema, restoreGame, type Game } from "@/lib/deck/games";

export const runtime = "nodejs";

const body = z.union([logGameSchema, z.object({ restore: z.looseObject({ id: z.number().int(), deckId: z.number().int(), playedAt: z.string(), result: z.enum(["win", "loss", "draw"]) }) })]);

/** POST /api/decks/:id/games: log a game ({ playedAt, result, players, turns?, notes? }), or put a deleted one back ({ restore }). */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number.parseInt((await params).id, 10);
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!Number.isFinite(id) || !parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const db = await getDb();
  if ("restore" in parsed.data) {
    await restoreGame(db, { ...(parsed.data.restore as Game), deckId: id });
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ game: await logGame(db, id, parsed.data) }, { status: 201 });
}
