import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { meta } from "@/db/schema";
import { noticeFor } from "@/lib/prices/alerts";
import { getPriceView } from "@/lib/settings";
import { formatMoney } from "@/lib/money";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/push/notice -> { title, body, url }: what the service worker shows when a push wakes it
 * (pushes carry no message, see src/lib/push.ts). A test sent in the last two minutes, or else the
 * alerts that went off.
 */
export async function GET() {
  const db = await getDb();
  const [[test], pv] = await Promise.all([db.select().from(meta).where(eq(meta.key, "push:test")), getPriceView()]);
  if (test && Date.now() - Date.parse(test.value) < 2 * 60_000) {
    await db.delete(meta).where(eq(meta.key, "push:test"));
    return NextResponse.json({ title: "Notifications are on", body: "Price alerts will show here when a card crosses your price.", url: "/collection/alerts" });
  }
  return NextResponse.json(await noticeFor(db, (usd) => formatMoney(usd, { ...pv, hide: false }) ?? ""));
}
