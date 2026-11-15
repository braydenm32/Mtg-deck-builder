import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { addCards } from "@/lib/collection/service";
import { addRequestSchema } from "@/lib/collection/schemas";
import type { CardEntry } from "@/lib/cards/identity";

export const runtime = "nodejs";

/**
 * POST /api/collection/items
 * { "source": "scanner", "cards": [ { "scryfallId": "...", "quantity": 1, "finish": "foil" },
 *                                   { "identity": { "name": "Sol Ring", "setCode": "c21" }, "quantity": 2 } ] }
 * -> { added: [{ index, itemId, printingId, quantity }], unmatched: [{ index, reason }] }
 */
export async function POST(req: Request) {
  const parsed = addRequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request", issues: parsed.error.issues }, { status: 400 });
  }
  const entries: CardEntry[] = parsed.data.cards.map((c) => {
    const identity = "scryfallId" in c && typeof c.scryfallId === "string" && !("identity" in c)
      ? { scryfallId: c.scryfallId, lang: (c as { lang?: string }).lang }
      : (c as { identity: CardEntry["identity"] }).identity;
    return {
      identity,
      quantity: c.quantity,
      finish: c.finish,
      condition: c.condition,
      location: c.location,
      altered: c.altered,
      signed: c.signed,
      misprint: c.misprint,
      proxy: c.proxy,
      purchasePrice: c.purchasePrice,
      printingConfidence: c.printingConfidence,
    };
  });
  const db = await getDb();
  const result = await addCards(db, entries, { source: parsed.data.source });
  return NextResponse.json(result, { status: result.added.length ? 201 : 422 });
}
