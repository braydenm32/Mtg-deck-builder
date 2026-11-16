import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { sellItemSchema } from "@/lib/collection/schemas";
import { getItem, sellItem } from "@/lib/collection/service";

export const runtime = "nodejs";

/** POST /api/collection/items/:id/sell { count, priceUsd, note? } -> { sold, item } (item null when none are left). */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number.parseInt((await params).id, 10);
  const parsed = sellItemSchema.safeParse(await req.json().catch(() => null));
  if (!Number.isFinite(id) || !parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const db = await getDb();
  const sold = await sellItem(db, id, parsed.data.count, parsed.data.priceUsd, parsed.data.note);
  if (!sold) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ sold, item: (await getItem(db, id)) ?? null });
}
