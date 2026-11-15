import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { searchCardNames } from "@/lib/cards/lookup";

export const runtime = "nodejs";

/** GET /api/cards/search?q=sol -> { cards: [{ oracleId, name, typeLine, imageSmall }] } */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q") ?? "";
  const db = await getDb();
  return NextResponse.json({ cards: await searchCardNames(db, q) });
}
