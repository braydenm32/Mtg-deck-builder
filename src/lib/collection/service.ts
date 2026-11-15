import { and, eq, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { collectionItems } from "@/db/schema";
import { matchIdentities, type MatchOptions, type MatchResult } from "@/lib/cards/match";
import { normCondition, normLang, type CardEntry, type Finish } from "@/lib/cards/identity";

/**
 * The app's own collection store. Every way of adding cards (CSV import, typed list,
 * manual add, phone scanner) ends up calling `addCards` or `addPrinting`.
 */

export type CollectionItem = typeof collectionItems.$inferSelect;

/** A card already matched to a Scryfall printing. This is what the scanner sends once it knows the card. */
export type AddPrintingInput = {
  scryfallId: string;
  quantity?: number;
  finish?: Finish;
  lang?: string;
  condition?: string;
  location?: string;
  altered?: boolean;
  signed?: boolean;
  misprint?: boolean;
  proxy?: boolean;
  purchasePrice?: number;
};

export type AddContext = {
  /** Where the card came from: "manual", "scanner", "csv:mythic-tools", "text"... */
  source: string;
  batchId?: number;
};

export type AddResult = {
  added: { index: number; itemId: number; printingId: string; quantity: number }[];
  unmatched: { index: number; reason: string }[];
};

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/**
 * Add one stack of a printing. Stacks merge: adding 1 more NM foil copy of a printing
 * you already have (same language, location and flags) bumps its quantity.
 */
async function upsertStack(
  db: Db | Tx,
  input: Required<Pick<AddPrintingInput, "scryfallId">> & AddPrintingInput & { oracleId: string; printingConfidence?: "exact" | "guessed" },
  ctx: AddContext,
): Promise<{ itemId: number; quantity: number }> {
  const quantity = Math.max(1, Math.floor(input.quantity ?? 1));
  const [row] = await db
    .insert(collectionItems)
    .values({
      printingId: input.scryfallId,
      oracleId: input.oracleId,
      quantity,
      finish: input.finish ?? "nonfoil",
      condition: normCondition(input.condition),
      lang: normLang(input.lang),
      location: input.location?.trim() ?? "",
      altered: !!input.altered,
      signed: !!input.signed,
      misprint: !!input.misprint,
      proxy: !!input.proxy,
      purchasePrice: input.purchasePrice ?? null,
      printingConfidence: input.printingConfidence ?? "exact",
      source: ctx.source,
      batchId: ctx.batchId ?? null,
      addedAt: new Date().toISOString(),
    })
    .onConflictDoUpdate({
      target: [
        collectionItems.printingId,
        collectionItems.finish,
        collectionItems.lang,
        collectionItems.condition,
        collectionItems.location,
        collectionItems.altered,
        collectionItems.signed,
        collectionItems.misprint,
        collectionItems.proxy,
      ],
      set: {
        quantity: sql`${collectionItems.quantity} + excluded.quantity`,
        purchasePrice: sql`COALESCE(excluded.purchase_price, ${collectionItems.purchasePrice})`,
        // Once anyone names the exact printing, the stack is no longer a guess.
        printingConfidence: sql`CASE WHEN excluded.printing_confidence = 'exact' THEN 'exact' ELSE ${collectionItems.printingConfidence} END`,
      },
    })
    .returning({ itemId: collectionItems.id, quantity: collectionItems.quantity });
  return row;
}

/**
 * Add cards that need matching first (CSV rows, typed names, scanner guesses).
 * Unmatched entries are returned with a reason and nothing is stored for them.
 */
export async function addCards(db: Db, entries: CardEntry[], ctx: AddContext, opts: MatchOptions = {}): Promise<AddResult> {
  const matches: MatchResult[] = await matchIdentities(
    db,
    entries.map((e) => e.identity),
    { ...opts, finishes: entries.map((e) => e.finish) },
  );
  const result: AddResult = { added: [], unmatched: [] };
  await db.transaction(async (tx) => {
    for (let i = 0; i < entries.length; i++) {
      const m = matches[i];
      const e = entries[i];
      if (!m.ok) {
        result.unmatched.push({ index: i, reason: m.reason });
        continue;
      }
      if (e.quantity <= 0) continue;
      // Never change the finish the user gave. If this printing isn't made in it, flag the stack instead.
      const finishFits = m.printing.finishes.includes(e.finish);
      const guessed = e.printingConfidence === "guessed" || m.via === "name" || m.via === "name-set" || !finishFits;
      const row = await upsertStack(
        tx,
        {
          scryfallId: m.printing.id,
          oracleId: m.printing.oracleId,
          quantity: e.quantity,
          finish: e.finish,
          printingConfidence: guessed ? "guessed" : "exact",
          lang: e.identity.lang ?? m.printing.lang,
          condition: e.condition,
          location: e.location,
          altered: e.altered,
          signed: e.signed,
          misprint: e.misprint,
          proxy: e.proxy,
          purchasePrice: e.purchasePrice,
        },
        ctx,
      );
      result.added.push({ index: i, itemId: row.itemId, printingId: m.printing.id, quantity: row.quantity });
    }
  });
  return result;
}

/**
 * Add a card you already know the printing of, e.g. from the scanner after the user confirms it.
 * Fetches the printing from Scryfall if it isn't in the local data yet.
 */
export async function addPrinting(db: Db, input: AddPrintingInput, ctx: AddContext) {
  const res = await addCards(
    db,
    [
      {
        identity: { scryfallId: input.scryfallId, lang: input.lang },
        quantity: input.quantity ?? 1,
        finish: input.finish ?? "nonfoil",
        condition: input.condition,
        location: input.location,
        altered: input.altered,
        signed: input.signed,
        misprint: input.misprint,
        proxy: input.proxy,
        purchasePrice: input.purchasePrice,
      },
    ],
    ctx,
  );
  if (res.unmatched.length) throw new Error(res.unmatched[0].reason);
  return res.added[0];
}

/** Set a stack's quantity; 0 removes it. */
export async function setQuantity(db: Db, itemId: number, quantity: number) {
  if (quantity <= 0) {
    await db.delete(collectionItems).where(eq(collectionItems.id, itemId));
    return;
  }
  await db.update(collectionItems).set({ quantity: Math.floor(quantity) }).where(eq(collectionItems.id, itemId));
}

export async function removeItem(db: Db, itemId: number) {
  await db.delete(collectionItems).where(eq(collectionItems.id, itemId));
}

/** Copies owned of a card across all printings, finishes and locations. */
export async function ownedCount(db: Db, oracleId: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`COALESCE(SUM(${collectionItems.quantity}), 0)` })
    .from(collectionItems)
    .where(eq(collectionItems.oracleId, oracleId));
  return Number(row?.n ?? 0);
}

export async function getItem(db: Db, itemId: number): Promise<CollectionItem | undefined> {
  const [row] = await db.select().from(collectionItems).where(and(eq(collectionItems.id, itemId)));
  return row;
}
