import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { createAlert, listAlerts, newAlertSchema } from "@/lib/prices/alerts";

export const runtime = "nodejs";

/** GET /api/alerts -> { alerts } (the ones that went off first). */
export async function GET() {
  return NextResponse.json({ alerts: await listAlerts(await getDb()) });
}

/** POST /api/alerts { oracleId, finish?, direction: "below"|"above", usd } -> { id } or { error } (400). */
export async function POST(req: Request) {
  const parsed = newAlertSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Pick a card and a price above zero." }, { status: 400 });
  const res = await createAlert(await getDb(), parsed.data);
  return "error" in res ? NextResponse.json(res, { status: 400 }) : NextResponse.json(res, { status: 201 });
}
