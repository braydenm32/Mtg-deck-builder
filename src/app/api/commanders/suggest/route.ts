import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { parseColors } from "@/lib/cards/normalize";
import { suggestCommanders } from "@/lib/deck/suggest";

export const runtime = "nodejs";

/**
 * GET /api/commanders/suggest?theme=aristocrats&colors=BR -> { owned: [...], popular: [...] }
 * Needs a theme, colours (exact colour identity; "C" for colourless), or both.
 */
export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const theme = sp.get("theme") || undefined;
  const colors = parseColors(sp.get("colors"));
  if (!theme && colors === undefined) return NextResponse.json({ error: "theme or colors is required" }, { status: 400 });
  return NextResponse.json(await suggestCommanders(await getDb(), theme, { colors }));
}
