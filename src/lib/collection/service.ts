import { and, eq, ne, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { collectionItems, deckCards } from "@/db/schema";
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
  input: Required<Pick<AddPrintingInput, "scryfallId">> &
    AddPrintingInput & { oracleId: string; printingConfidence?: "exact" | "guessed"; matchNote?: string },
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
      matchNote: input.matchNote ?? "",
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
        collectionItems.source,
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
/** A matched entry, ready to become (or update) a collection stack. */
export type ResolvedStack = Required<Pick<AddPrintingInput, "scryfallId">> &
  AddPrintingInput & { oracleId: string; printingConfidence: "exact" | "guessed"; matchNote: string; quantity: number; finish: Finish };

/** Match entries to printings without writing anything. */
export async function resolveEntries(
  db: Db,
  entries: CardEntry[],
  opts: MatchOptions = {},
): Promise<{ resolved: { index: number; stack: ResolvedStack }[]; unmatched: { index: number; reason: string }[] }> {
  const matches: MatchResult[] = await matchIdentities(
    db,
    entries.map((e) => e.identity),
    { ...opts, finishes: entries.map((e) => e.finish) },
  );
  const resolved: { index: number; stack: ResolvedStack }[] = [];
  const unmatched: { index: number; reason: string }[] = [];
  for (let i = 0; i < entries.length; i++) {
    const m = matches[i];
    const e = entries[i];
    if (!m.ok) {
      unmatched.push({ index: i, reason: m.reason });
      continue;
    }
    if (e.quantity <= 0) continue;
    // Never change the finish the user gave. If this printing isn't made in it, flag the stack instead.
    const finishFits = m.printing.finishes.includes(e.finish);
    const guessed = e.printingConfidence === "guessed" || m.via === "name" || m.via === "name-set" || !finishFits;
    resolved.push({
      index: i,
      stack: {
        scryfallId: m.printing.id,
        oracleId: m.printing.oracleId,
        quantity: e.quantity,
        finish: e.finish,
        printingConfidence: guessed ? "guessed" : "exact",
        matchNote: [m.note, !finishFits ? `${m.printing.setCode.toUpperCase()} #${m.printing.collectorNumber} isn't made in ${e.finish}` : undefined]
          .filter(Boolean)
          .join("; "),
        lang: normLang(e.identity.lang ?? m.printing.lang),
        condition: normCondition(e.condition),
        location: e.location?.trim() ?? "",
        altered: !!e.altered,
        signed: !!e.signed,
        misprint: !!e.misprint,
        proxy: !!e.proxy,
        purchasePrice: e.purchasePrice,
      },
    });
  }
  return { resolved, unmatched };
}

/**
 * Add cards that need matching first (CSV rows, typed names, scanner guesses).
 * Unmatched entries are returned with a reason and nothing is stored for them.
 */
export async function addCards(db: Db, entries: CardEntry[], ctx: AddContext, opts: MatchOptions = {}): Promise<AddResult> {
  const { resolved, unmatched } = await resolveEntries(db, entries, opts);
  const result: AddResult = { added: [], unmatched };
  await db.transaction(async (tx) => {
    for (const r of resolved) {
      const row = await upsertStack(tx, r.stack, ctx);
      result.added.push({ index: r.index, itemId: row.itemId, printingId: r.stack.scryfallId, quantity: row.quantity });
    }
  });
  return result;
}

/** The fields that make two copies the same stack (plus source). */
export function stackKey(s: {
  printingId?: string;
  scryfallId?: string;
  finish?: string;
  lang?: string;
  condition?: string;
  location?: string;
  altered?: boolean;
  signed?: boolean;
  misprint?: boolean;
  proxy?: boolean;
}): string {
  return [s.printingId ?? s.scryfallId, s.finish ?? "nonfoil", s.lang ?? "en", s.condition ?? "", s.location ?? "", +!!s.altered, +!!s.signed, +!!s.misprint, +!!s.proxy].join("|");
}

export type SyncDiff = {
  added: number;
  removed: number;
  changed: number;
  unchanged: number;
  /** Copies, not stacks. */
  copiesBefore: number;
  copiesAfter: number;
};

/**
 * Make one source's stacks match a fresh export: update quantities, add new stacks, remove gone
 * ones. Unchanged stacks keep their IDs, so decks that use them aren't disturbed.
 */
export async function syncSource(
  db: Db,
  source: string,
  stacks: ResolvedStack[],
  ctx: AddContext,
  opts: { dryRun?: boolean } = {},
): Promise<SyncDiff> {
  // Merge duplicate rows in the file into one stack each.
  const wanted = new Map<string, ResolvedStack>();
  for (const st of stacks) {
    const k = stackKey(st);
    const prev = wanted.get(k);
    if (prev) prev.quantity += st.quantity;
    else wanted.set(k, { ...st });
  }
  const existing = await db.select().from(collectionItems).where(eq(collectionItems.source, source));
  const have = new Map(existing.map((e) => [stackKey(e), e]));
  const diff: SyncDiff = {
    added: 0,
    removed: 0,
    changed: 0,
    unchanged: 0,
    copiesBefore: existing.reduce((n, e) => n + e.quantity, 0),
    copiesAfter: [...wanted.values()].reduce((n, w) => n + w.quantity, 0),
  };
  for (const [k, w] of wanted) {
    const h = have.get(k);
    if (!h) diff.added += 1;
    else if (h.quantity !== w.quantity) diff.changed += 1;
    else diff.unchanged += 1;
  }
  for (const k of have.keys()) if (!wanted.has(k)) diff.removed += 1;
  if (opts.dryRun) return diff;

  await db.transaction(async (tx) => {
    for (const [k, w] of wanted) {
      const h = have.get(k);
      if (!h) await upsertStack(tx, w, ctx);
      else if (h.quantity !== w.quantity || h.printingConfidence !== w.printingConfidence || h.matchNote !== w.matchNote) {
        await tx
          .update(collectionItems)
          .set({ quantity: w.quantity, printingConfidence: w.printingConfidence, matchNote: w.matchNote, batchId: ctx.batchId ?? h.batchId })
          .where(eq(collectionItems.id, h.id));
      }
    }
    for (const [k, h] of have) if (!wanted.has(k)) await tx.delete(collectionItems).where(eq(collectionItems.id, h.id));
  });
  return diff;
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

/**
 * Move copies of a stack to another location (box, binder, or "" for none). Moves the whole stack
 * unless `quantity` says fewer. Copies merge into an identical stack already at that location.
 * Decks keep their copies: a deck card pointing at the old stack follows the copies it needs.
 * Returns the stack the copies are now in.
 */
export async function moveItem(db: Db, itemId: number, location: string, quantity?: number): Promise<number | undefined> {
  const src = await getItem(db, itemId);
  if (!src) return undefined;
  const to = location.trim();
  if (to === src.location) return src.id;
  const n = Math.min(src.quantity, Math.max(1, Math.floor(quantity ?? src.quantity)));
  return db.transaction(async (tx) => {
    const [target] = await tx
      .select()
      .from(collectionItems)
      .where(
        and(
          eq(collectionItems.printingId, src.printingId),
          eq(collectionItems.finish, src.finish),
          eq(collectionItems.lang, src.lang),
          eq(collectionItems.condition, src.condition),
          eq(collectionItems.location, to),
          eq(collectionItems.altered, src.altered),
          eq(collectionItems.signed, src.signed),
          eq(collectionItems.misprint, src.misprint),
          eq(collectionItems.proxy, src.proxy),
          eq(collectionItems.source, src.source),
          ne(collectionItems.id, src.id),
        ),
      );
    if (!target && n === src.quantity) {
      await tx.update(collectionItems).set({ location: to }).where(eq(collectionItems.id, src.id));
      return src.id;
    }
    let destId: number;
    if (target) {
      await tx.update(collectionItems).set({ quantity: target.quantity + n }).where(eq(collectionItems.id, target.id));
      destId = target.id;
    } else {
      const { id: _id, ...rest } = src;
      void _id;
      const [row] = await tx.insert(collectionItems).values({ ...rest, location: to, quantity: n }).returning({ id: collectionItems.id });
      destId = row.id;
    }
    const left = src.quantity - n;
    // Deck cards using the old stack: keep as many there as it still has copies, move the rest along.
    const users = await tx.select().from(deckCards).where(eq(deckCards.collectionItemId, src.id));
    let kept = 0;
    for (const u of users) {
      if (kept + u.quantity <= left) kept += u.quantity;
      else await tx.update(deckCards).set({ collectionItemId: destId }).where(eq(deckCards.id, u.id));
    }
    if (left === 0) await tx.delete(collectionItems).where(eq(collectionItems.id, src.id));
    else await tx.update(collectionItems).set({ quantity: left }).where(eq(collectionItems.id, src.id));
    return destId;
  });
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
