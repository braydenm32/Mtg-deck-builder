import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { safeEqual } from "@/lib/auth";
import { priceState, pricesDue, refreshPrices } from "@/lib/prices/daily";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/cron/prices: the daily price check, started by Vercel's scheduler (vercel.json), so price
 * alerts go off even on a day you don't open the app. The lock lets it through (middleware.ts):
 * with CRON_SECRET set, Vercel sends `Authorization: Bearer <CRON_SECRET>` and nothing else gets
 * in; without it, only Vercel's scheduler (by its user agent) is let in. Either way all it can do is
 * start a price check that runs at most once a day, and it shows no data.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const allowed = secret ? safeEqual(req.headers.get("authorization") ?? "", `Bearer ${secret}`) : (req.headers.get("user-agent") ?? "").startsWith("vercel-cron/");
  if (!allowed) return NextResponse.json({ error: "Not allowed" }, { status: 401 });
  const db = await getDb();
  if (!pricesDue(await priceState(db))) return NextResponse.json({ skipped: "Checked recently." });
  return NextResponse.json(await refreshPrices(db, { budgetMs: 45_000 }));
}
