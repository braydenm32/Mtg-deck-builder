import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db/client";
import { copyDeck } from "@/lib/deck/store";

export const runtime = "nodejs";

const body = z.object({ name: z.string().max(120).optional() }).default({});

/** POST /api/decks/:id/copy { name? } -> { id, name } of the new deck (an Idea with the same list). */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number.parseInt((await params).id, 10);
  const parsed = body.safeParse(await req.json().catch(() => ({})));
  if (!Number.isFinite(id) || !parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const copy = await copyDeck(await getDb(), id, parsed.data.name);
  return copy ? NextResponse.json({ id: copy.id, name: copy.name }) : NextResponse.json({ error: "Not found" }, { status: 404 });
}
