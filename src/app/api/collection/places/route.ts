import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { renamePlace } from "@/lib/collection/bulk";
import { renamePlaceSchema } from "@/lib/collection/bulk-schema";

export const runtime = "nodejs";

/** PATCH /api/collection/places { from, to }: rename a box or binder, or merge it into another. Undo with /api/collection/bulk/undo. */
export async function PATCH(req: Request) {
  const parsed = renamePlaceSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  return NextResponse.json(await renamePlace(await getDb(), parsed.data.from, parsed.data.to));
}
