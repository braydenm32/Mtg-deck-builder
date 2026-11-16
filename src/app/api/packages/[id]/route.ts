import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db/client";
import { addPackageCards, deletePackage, getPackage, removePackageCard, updatePackage } from "@/lib/deck/packages";

export const runtime = "nodejs";

const patchSchema = z.object({
  name: z.string().max(80).optional(),
  notes: z.string().max(500).optional(),
  add: z.array(z.string().min(1)).max(100).optional(),
  remove: z.string().min(1).optional(),
});

type Ctx = { params: Promise<{ id: string }> };

/** PATCH /api/packages/:id { name?, notes?, add?: oracleIds, remove?: oracleId } */
export async function PATCH(req: Request, { params }: Ctx) {
  const id = Number.parseInt((await params).id, 10);
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!Number.isFinite(id) || !parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const db = await getDb();
  if (!(await getPackage(db, id))) return NextResponse.json({ error: "Package not found" }, { status: 404 });
  const { name, notes, add, remove } = parsed.data;
  if (name !== undefined || notes !== undefined) await updatePackage(db, id, { name, notes });
  if (add?.length) await addPackageCards(db, id, add);
  if (remove) await removePackageCard(db, id, remove);
  return NextResponse.json(await getPackage(db, id));
}

/** DELETE /api/packages/:id: the package goes; decks keep any cards it added. */
export async function DELETE(_req: Request, { params }: Ctx) {
  const id = Number.parseInt((await params).id, 10);
  if (!Number.isFinite(id)) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  await deletePackage(await getDb(), id);
  return new NextResponse(null, { status: 204 });
}
