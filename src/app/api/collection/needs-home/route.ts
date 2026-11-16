import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db/client";
import { giveAllAHome } from "@/lib/collection/locations";

export const runtime = "nodejs";

const bodySchema = z.object({ location: z.string().trim().min(1).max(120) });

/**
 * POST /api/collection/needs-home { "location": "Binder 2" }
 * Puts every card that needs a home (no location, not a proxy) in that place. Returns { moved }, in copies.
 */
export async function POST(req: Request) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const moved = await giveAllAHome(await getDb(), parsed.data.location);
  return NextResponse.json({ moved });
}
