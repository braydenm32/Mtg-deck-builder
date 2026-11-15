import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { buildSettingsSchema } from "@/lib/deck/schemas";
import { rebuildDeck } from "@/lib/deck/store";

export const runtime = "nodejs";

/** POST /api/decks/:id/rebuild { suggestUnowned?, maxPrice?, targets? } - keeps locked and hand-added cards. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number.parseInt((await params).id, 10);
  const parsed = buildSettingsSchema.safeParse((await req.json().catch(() => ({}))) ?? {});
  if (!Number.isFinite(id) || !parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  try {
    const r = await rebuildDeck(await getDb(), id, parsed.data);
    return NextResponse.json({ warnings: r.warnings, counts: r.counts });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 404 });
  }
}
