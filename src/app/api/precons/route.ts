import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db/client";
import { importPrecon, listPrecons } from "@/lib/deck/precons";

export const runtime = "nodejs";
export const maxDuration = 60;

/** GET /api/precons -> { precons: PreconSummary[] } (every Commander precon, newest first). */
export async function GET() {
  try {
    return NextResponse.json({ precons: await listPrecons(await getDb()) });
  } catch {
    return NextResponse.json({ error: "Couldn’t reach MTGJSON for the precon list. Check the connection and try again." }, { status: 502 });
  }
}

const body = z.object({ fileName: z.string().min(1).max(120), owned: z.boolean(), location: z.string().max(120).optional() });

/** POST /api/precons { fileName, owned, location? } -> 201 { deckId, name, copies, unmatched } | 4xx/502 { error } */
export async function POST(req: Request) {
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const r = await importPrecon(await getDb(), parsed.data.fileName, parsed.data);
  return r.ok ? NextResponse.json(r, { status: 201 }) : NextResponse.json({ error: r.error }, { status: 502 });
}
