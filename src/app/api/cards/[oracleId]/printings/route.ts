import { NextResponse } from "next/server";
import { and, desc, eq, isNotNull } from "drizzle-orm";
import { getDb } from "@/db/client";
import { collectionItems, printings } from "@/db/schema";

export const runtime = "nodejs";

/**
 * GET /api/cards/:oracleId/printings -> { printings: { id, setCode, setName, collectorNumber, imageSmall, owned }[] }
 * Every printing with a picture, newest first, English before other languages, for choosing the
 * picture a deck shows. `owned` marks the ones you have a copy of. Read by the card's oracle ID (indexed).
 */
export async function GET(_req: Request, { params }: { params: Promise<{ oracleId: string }> }) {
  const { oracleId } = await params;
  if (!/^[0-9a-f-]{36}$/.test(oracleId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  const db = await getDb();
  const [rows, mine] = await Promise.all([
    db
      .select({ id: printings.id, setCode: printings.setCode, setName: printings.setName, collectorNumber: printings.collectorNumber, imageSmall: printings.imageSmall, lang: printings.lang })
      .from(printings)
      .where(and(eq(printings.oracleId, oracleId), isNotNull(printings.imageSmall)))
      .orderBy(desc(printings.releasedAt)),
    db.selectDistinct({ id: collectionItems.printingId }).from(collectionItems).where(eq(collectionItems.oracleId, oracleId)),
  ]);
  const owned = new Set(mine.map((m) => m.id));
  const list = [...rows.filter((r) => r.lang === "en"), ...rows.filter((r) => r.lang !== "en")].slice(0, 120);
  return NextResponse.json({ printings: list.map((r) => ({ id: r.id, setCode: r.setCode, setName: r.setName, collectorNumber: r.collectorNumber, imageSmall: r.imageSmall, owned: owned.has(r.id) })) });
}
