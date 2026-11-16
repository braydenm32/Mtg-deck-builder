import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db/client";
import { setDeckShared } from "@/lib/deck/share";

export const runtime = "nodejs";

/** POST /api/decks/:id/share { on }: make the deck's read-only link (or keep the one it has), or turn it off. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number.parseInt((await params).id, 10);
  const parsed = z.object({ on: z.boolean() }).safeParse(await req.json().catch(() => null));
  if (!Number.isFinite(id) || !parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const token = await setDeckShared(await getDb(), id, parsed.data.on);
  if (token === undefined) return NextResponse.json({ error: "Deck not found" }, { status: 404 });
  return NextResponse.json({ token });
}
