import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { inArray } from "drizzle-orm";
import { cards } from "@/db/schema";
import { searchCardNames } from "@/lib/cards/lookup";

export const runtime = "nodejs";

/**
 * GET /api/cards/search?q=sol -> { cards: [{ oracleId, name, typeLine, imageSmall, colorIdentity }] }
 * Optional: commander=1 (only possible commanders), identity=BRG (only cards in those colours),
 * prices=1 (each card's market price in US dollars, as priceUsd, for the trade calculator).
 */
export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const identity = sp.get("identity");
  const db = await getDb();
  const found = await searchCardNames(db, sp.get("q") ?? "", 20, {
    commander: sp.get("commander") === "1",
    identity: identity === null ? undefined : identity.toUpperCase().replace(/[^WUBRG]/g, ""),
  });
  if (sp.get("prices") !== "1" || !found.length) return NextResponse.json({ cards: found });
  const priced = await db.select({ oracleId: cards.oracleId, priceUsd: cards.priceUsd }).from(cards).where(inArray(cards.oracleId, found.map((c) => c.oracleId)));
  const price = new Map(priced.map((p) => [p.oracleId, p.priceUsd]));
  return NextResponse.json({ cards: found.map((c) => ({ ...c, priceUsd: price.get(c.oracleId) ?? null })) });
}
