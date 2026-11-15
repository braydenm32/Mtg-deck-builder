import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { suggestCommanders } from "@/lib/deck/suggest";

export const runtime = "nodejs";

/** GET /api/commanders/suggest?theme=aristocrats -> { owned: [...], popular: [...] } */
export async function GET(req: Request) {
  const theme = new URL(req.url).searchParams.get("theme");
  if (!theme) return NextResponse.json({ error: "theme is required" }, { status: 400 });
  return NextResponse.json(await suggestCommanders(await getDb(), theme));
}
