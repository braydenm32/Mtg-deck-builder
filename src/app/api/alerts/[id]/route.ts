import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { deleteAlert } from "@/lib/prices/alerts";

export const runtime = "nodejs";

/** DELETE /api/alerts/:id -> 204, or 404 when there's no such alert. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  return (await deleteAlert(await getDb(), id)) ? new NextResponse(null, { status: 204 }) : NextResponse.json({ error: "No such alert" }, { status: 404 });
}
