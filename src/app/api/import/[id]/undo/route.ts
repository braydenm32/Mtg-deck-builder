import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { undoImport } from "@/lib/collection/import";

export const runtime = "nodejs";

/** POST /api/import/:id/undo -> puts that app's cards back as they were before the import. */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number.parseInt((await params).id, 10);
  if (!Number.isFinite(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  const ok = await undoImport(await getDb(), id);
  return ok
    ? NextResponse.json({ undone: true })
    : NextResponse.json({ error: "Only the latest import from each app can be undone, once." }, { status: 409 });
}
