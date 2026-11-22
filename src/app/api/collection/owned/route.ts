import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { ownedSummary } from "@/lib/deck/store";

export const runtime = "nodejs";

/** FNV-1a over the body: the same answer gets the same tag. */
function tag(body: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < body.length; i++) h = Math.imul(h ^ body.charCodeAt(i), 0x01000193);
  return `"o-${(h >>> 0).toString(36)}-${body.length.toString(36)}"`;
}

/**
 * GET /api/collection/owned -> { decks, cards }: how many copies you own of each card and which of your
 * Building and Built decks hold them (see ownedSummary). The device keeps it so a card added to a deck
 * offline shows whether you have a copy for it (src/lib/offline/owned.ts). 304 when unchanged.
 */
export async function GET(req: Request) {
  const body = JSON.stringify(await ownedSummary(await getDb()));
  const etag = tag(body);
  const headers = { etag, "cache-control": "private, no-cache" };
  if (req.headers.get("if-none-match") === etag) return new NextResponse(null, { status: 304, headers });
  return new NextResponse(body, { headers: { ...headers, "content-type": "application/json" } });
}
