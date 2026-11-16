import { after, NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { cardDataState, refreshCardData } from "@/lib/cards/refresh";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// The download carries on after the reply (see `after` below); on Vercel this is how long it may run.
export const maxDuration = 300;

/** GET /api/cards/sync -> { lastSync?, runningSince?, error? } */
export async function GET() {
  const db = await getDb();
  return NextResponse.json(await cardDataState(db));
}

/**
 * POST /api/cards/sync[?force=1] -> 202 { started: true }, or 409 when a download is already running.
 * Starts downloading Scryfall's card data and replies straight away; poll GET to see it finish.
 */
export async function POST(req: Request) {
  const db = await getDb();
  const state = await cardDataState(db);
  if (state.runningSince) return NextResponse.json({ started: false, ...state }, { status: 409 });
  const force = new URL(req.url).searchParams.get("force") === "1";
  after(() => refreshCardData(db, { force }));
  return NextResponse.json({ started: true }, { status: 202 });
}
