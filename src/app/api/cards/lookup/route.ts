import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { printingById, printingsByName, printingsBySetNumber } from "@/lib/cards/lookup";

export const runtime = "nodejs";

/**
 * GET /api/cards/lookup?id=<scryfall id>
 * GET /api/cards/lookup?set=c21&number=263
 * GET /api/cards/lookup?name=Sol%20Ring
 * -> { printings: Printing[] } from the local card database.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  const set = url.searchParams.get("set");
  const number = url.searchParams.get("number");
  const name = url.searchParams.get("name");
  const db = await getDb();
  let found;
  if (id) found = [await printingById(db, id)].filter(Boolean);
  else if (set && number) found = await printingsBySetNumber(db, set, number);
  else if (name) found = await printingsByName(db, name);
  else return NextResponse.json({ error: "Pass id, set + number, or name" }, { status: 400 });
  return NextResponse.json({ printings: found });
}
