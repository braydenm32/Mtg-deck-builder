import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { cards } from "@/db/schema";
import { deckEdhrec } from "@/lib/deck/store";
import { THEMES } from "@/lib/deck/themes";

export const runtime = "nodejs";

/**
 * GET /api/decks/themes?commander=<oracleId> -> { themes: [{ slug, label, count? }] }
 * EDHREC's themes for that commander first (most decks first), then our built-in themes.
 */
export async function GET(req: Request) {
  const oracleId = new URL(req.url).searchParams.get("commander");
  const db = await getDb();
  const out: { slug: string; label: string; count?: number }[] = [];
  if (oracleId) {
    const [c] = await db.select({ name: cards.name }).from(cards).where(eq(cards.oracleId, oracleId));
    const edh = c ? await deckEdhrec(db, c.name) : undefined;
    for (const t of edh?.themes ?? []) out.push({ slug: t.slug, label: t.label, count: t.count });
  }
  for (const t of THEMES) if (!out.some((o) => o.slug === t.slug)) out.push({ slug: t.slug, label: t.label });
  return NextResponse.json({ themes: out });
}
