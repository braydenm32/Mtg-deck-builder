import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { cardRulings } from "@/lib/cards/rulings";

export const runtime = "nodejs";

/** GET /api/cards/:oracleId/rulings -> { rulings: { date, text, source }[], ok } */
export async function GET(_req: Request, { params }: { params: Promise<{ oracleId: string }> }) {
  const { oracleId } = await params;
  if (!/^[0-9a-f-]{36}$/.test(oracleId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  return NextResponse.json(await cardRulings(await getDb(), oracleId));
}
