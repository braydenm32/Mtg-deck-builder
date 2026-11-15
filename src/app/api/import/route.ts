import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { importCollection } from "@/lib/collection/import";
import { importRequestSchema } from "@/lib/collection/import-schema";

export const runtime = "nodejs";
export const maxDuration = 300;

/** POST /api/import { text, filename?, mode?, source? } -> ImportSummary */
export async function POST(req: Request) {
  const parsed = importRequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request", issues: parsed.error.issues }, { status: 400 });
  const summary = await importCollection(await getDb(), parsed.data);
  return NextResponse.json(summary, { status: 201 });
}
