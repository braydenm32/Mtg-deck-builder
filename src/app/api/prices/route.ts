import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { refreshPrices } from "@/lib/prices/daily";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Check today's prices for the cards you own now (the Value page's button). */
export async function POST() {
  const result = await refreshPrices(await getDb(), { budgetMs: 45_000 });
  return NextResponse.json(result);
}
