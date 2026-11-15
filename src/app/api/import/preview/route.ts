import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { previewImport } from "@/lib/collection/import";
import { importRequestSchema } from "@/lib/collection/import-schema";

export const runtime = "nodejs";

/** POST /api/import/preview { text, source? } -> what would be imported. Writes nothing. */
export async function POST(req: Request) {
  const parsed = importRequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request", issues: parsed.error.issues }, { status: 400 });
  return NextResponse.json(await previewImport(await getDb(), parsed.data));
}
