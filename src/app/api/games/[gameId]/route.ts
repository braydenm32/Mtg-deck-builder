import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { deleteGame } from "@/lib/deck/games";

export const runtime = "nodejs";

/** DELETE /api/games/:gameId -> the removed game, for Undo. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ gameId: string }> }) {
  const id = Number.parseInt((await params).gameId, 10);
  const game = Number.isFinite(id) ? await deleteGame(await getDb(), id) : undefined;
  if (!game) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ game });
}
