import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { searchCardNames } from "@/lib/cards/lookup";

export const runtime = "nodejs";

/**
 * GET /api/cards/search?q=sol -> { cards: [{ oracleId, name, typeLine, imageSmall, colorIdentity }] }
 * Optional: commander=1 (only possible commanders), identity=BRG (only cards in those colours).
 */
export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const identity = sp.get("identity");
  const db = await getDb();
  const found = await searchCardNames(db, sp.get("q") ?? "", 20, {
    commander: sp.get("commander") === "1",
    identity: identity === null ? undefined : identity.toUpperCase().replace(/[^WUBRG]/g, ""),
  });
  return NextResponse.json({ cards: found });
}
