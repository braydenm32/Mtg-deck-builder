import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db/client";
import { getSettings, saveSettings } from "@/lib/settings";

export const runtime = "nodejs";

const patchSchema = z.object({ hidePrices: z.boolean().optional(), currency: z.enum(["USD", "AUD"]).optional() });

export async function GET() {
  return NextResponse.json(await getSettings(await getDb()));
}

/** PATCH /api/settings { hidePrices?, currency? } */
export async function PATCH(req: Request) {
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  return NextResponse.json(await saveSettings(await getDb(), parsed.data));
}
