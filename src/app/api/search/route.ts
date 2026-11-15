import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { quickSearch } from "@/lib/search";

export const runtime = "nodejs";

/** GET /api/search?q=boots -> { decks: [...], cards: [...] } for ⌘K. */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q") ?? "";
  const db = await getDb();
  return NextResponse.json(await quickSearch(db, q.slice(0, 100)));
}
