import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { cardList } from "@/lib/cards/card-list";
import { cardNameRows } from "@/lib/cards/name-cache";

export const runtime = "nodejs";

/**
 * GET /api/cards/names -> { cards: CardListRow[] }, every card you can put in a deck, most popular
 * first: the device keeps it (src/lib/offline/card-index.ts) so adding a card searches instantly and
 * works offline. Answers 304 to If-None-Match when the list hasn't changed. Built from the name cache
 * the search already holds, so it costs no extra database reads.
 */
export async function GET(req: Request) {
  const { etag, body } = cardList(await cardNameRows(await getDb()));
  const headers = { etag, "cache-control": "private, no-cache" };
  if (req.headers.get("if-none-match") === etag) return new NextResponse(null, { status: 304, headers });
  return new NextResponse(body, { headers: { ...headers, "content-type": "application/json" } });
}
