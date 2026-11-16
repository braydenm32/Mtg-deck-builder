import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { FINISHES, quoteFor, type AlertFinish } from "@/lib/prices/alerts";

export const runtime = "nodejs";

/** GET /api/alerts/quote?oracleId=…&finish=foil -> { quote: { printingId, label, usd, owned, name } } (the printing an alert would watch). */
export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const oracleId = sp.get("oracleId") ?? "";
  const finish = (FINISHES as readonly string[]).includes(sp.get("finish") ?? "") ? (sp.get("finish") as AlertFinish) : "nonfoil";
  if (!oracleId) return NextResponse.json({ error: "Which card?" }, { status: 400 });
  const quote = await quoteFor(await getDb(), oracleId, finish);
  return quote ? NextResponse.json({ quote }) : NextResponse.json({ error: "That card isn’t in the card data." }, { status: 404 });
}
