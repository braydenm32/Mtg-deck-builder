import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db/client";
import { getItem, setQuantity } from "@/lib/collection/service";

export const runtime = "nodejs";

const body = z.object({ itemId: z.number().int().positive(), quantity: z.number().int().positive().max(1000).default(1) });

/**
 * POST /api/scan/undo { itemId, quantity? }
 * Takes back copies a scan added: lowers the stack by `quantity` (default 1) and removes it at 0.
 * Works from the stack's current size, so it's safe even if other copies were added since.
 * -> { itemId, quantity }  (quantity 0 = stack removed)
 */
export async function POST(req: Request) {
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const db = await getDb();
  const item = await getItem(db, parsed.data.itemId);
  if (!item) return NextResponse.json({ itemId: parsed.data.itemId, quantity: 0 });
  const quantity = Math.max(0, item.quantity - parsed.data.quantity);
  await setQuantity(db, item.id, quantity);
  return NextResponse.json({ itemId: item.id, quantity });
}
