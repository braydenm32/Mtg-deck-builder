import { eq, inArray } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import type { Db } from "@/db/client";
import { collectionItems, deckCards, meta } from "@/db/schema";
import { normCondition } from "@/lib/cards/identity";

/**
 * Change many stacks at once: move them to a box or binder, set their condition, mark them as
 * proxies (or not), or remove them. Whole stacks change, so a deck holding copies of a stack keeps
 * them: where a changed stack becomes identical to one you already have, the two merge and the deck
 * follows the copies. Everything is written in one batch (one round trip to a hosted database), and
 * the stacks as they were are kept so the last change can be undone.
 */
export type StackPatch = { location?: string; condition?: string; proxy?: boolean };
export type BulkAction = { kind: "update"; patch: StackPatch } | { kind: "remove" };

export type BulkResult = {
  /** Stacks changed or removed. */
  stacks: number;
  /** Copies in them. */
  copies: number;
  /** Stacks that merged into an identical one. */
  merged: number;
  /** Copies decks were holding (for a remove, the decks now show them as missing). */
  inDecks: number;
};

type Item = typeof collectionItems.$inferSelect;
type Link = { id: number; collectionItemId: number | null };
type Undo = { at: string; ids: number[]; rows: Item[]; links: Link[] };

const UNDO_KEY = "bulk-undo";
const CHUNK = 400;

const chunks = <T>(xs: T[], n = CHUNK) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));

/** The unique-stack key from the schema (collection_stack_uq). */
const keyOf = (r: Item) => [r.printingId, r.finish, r.lang, r.condition, r.location, r.altered, r.signed, r.misprint, r.proxy, r.source].join("\u0001");

async function rowsByIds(db: Db, ids: number[]): Promise<Item[]> {
  const out: Item[] = [];
  for (const c of chunks(ids)) out.push(...(await db.select().from(collectionItems).where(inArray(collectionItems.id, c))));
  return out;
}

async function linksTo(db: Db, ids: number[]): Promise<(Link & { quantity: number })[]> {
  const out: (Link & { quantity: number })[] = [];
  for (const c of chunks(ids))
    out.push(
      ...(await db
        .select({ id: deckCards.id, collectionItemId: deckCards.collectionItemId, quantity: deckCards.quantity })
        .from(deckCards)
        .where(inArray(deckCards.collectionItemId, c))),
    );
  return out;
}

function cleanPatch(p: StackPatch): StackPatch {
  const out: StackPatch = {};
  if (p.location !== undefined) out.location = p.location.trim().slice(0, 120);
  if (p.condition !== undefined) out.condition = normCondition(p.condition);
  if (p.proxy !== undefined) out.proxy = !!p.proxy;
  return out;
}

/** What an action would touch, without changing anything (for the confirm step). */
export async function previewBulk(db: Db, ids: number[]): Promise<BulkResult> {
  const rows = await rowsByIds(db, [...new Set(ids)]);
  const links = await linksTo(db, rows.map((r) => r.id));
  return { stacks: rows.length, copies: rows.reduce((n, r) => n + r.quantity, 0), merged: 0, inDecks: links.reduce((n, l) => n + l.quantity, 0) };
}

export async function applyBulk(db: Db, ids: number[], action: BulkAction, now = new Date()): Promise<BulkResult> {
  const rows = await rowsByIds(db, [...new Set(ids)]);
  if (!rows.length) return { stacks: 0, copies: 0, merged: 0, inDecks: 0 };
  const links = await linksTo(db, rows.map((r) => r.id));
  const inDecks = links.reduce((n, l) => n + l.quantity, 0);
  const copies = rows.reduce((n, r) => n + r.quantity, 0);
  const statements: BatchItem<"sqlite">[] = [];

  if (action.kind === "remove") {
    const removed = rows.map((r) => r.id);
    // Decks stop pointing at copies that are gone, so they show as missing instead of placed.
    for (const c of chunks(removed)) statements.push(db.update(deckCards).set({ collectionItemId: null }).where(inArray(deckCards.collectionItemId, c)));
    for (const c of chunks(removed)) statements.push(db.delete(collectionItems).where(inArray(collectionItems.id, c)));
    statements.push(saveUndo(db, { at: now.toISOString(), ids: removed, rows, links: links.map(({ id, collectionItemId }) => ({ id, collectionItemId })) }));
    await runBatch(db, statements);
    return { stacks: rows.length, copies, merged: 0, inDecks };
  }

  const patch = cleanPatch(action.patch);
  // Every stack of the same printings: the ones a changed stack could merge into.
  const printingIds = [...new Set(rows.map((r) => r.printingId))];
  const others: Item[] = [];
  for (const c of chunks(printingIds))
    others.push(...(await db.select().from(collectionItems).where(inArray(collectionItems.printingId, c))));
  const byKey = new Map<string, Item>();
  for (const r of others) byKey.set(keyOf(r), { ...r });
  const before = new Map(others.map((r) => [r.id, r]));

  const updated: number[] = [];
  const grow = new Map<number, number>(); // target id -> its new quantity
  const mergedInto = new Map<number, number>(); // removed stack id -> target id
  for (const r of rows) {
    const cur = byKey.get(keyOf(r));
    if (!cur || cur.id !== r.id) continue; // already merged away (can't happen with one patch, but be safe)
    const next = { ...cur, ...patch };
    const k = keyOf(next);
    if (k === keyOf(cur)) continue;
    byKey.delete(keyOf(cur));
    const target = byKey.get(k);
    if (target) {
      target.quantity += cur.quantity;
      grow.set(target.id, target.quantity);
      mergedInto.set(cur.id, target.id);
    } else {
      byKey.set(k, next);
      updated.push(cur.id);
    }
  }

  for (const c of chunks(updated)) statements.push(db.update(collectionItems).set(patch).where(inArray(collectionItems.id, c)));
  for (const [id, quantity] of grow) statements.push(db.update(collectionItems).set({ quantity }).where(eq(collectionItems.id, id)));
  for (const [from, to] of mergedInto) statements.push(db.update(deckCards).set({ collectionItemId: to }).where(eq(deckCards.collectionItemId, from)));
  for (const c of chunks([...mergedInto.keys()])) statements.push(db.delete(collectionItems).where(inArray(collectionItems.id, c)));

  const touched = [...new Set([...updated, ...grow.keys(), ...mergedInto.keys()])];
  if (!touched.length) return { stacks: 0, copies: 0, merged: 0, inDecks: 0 };
  statements.push(
    saveUndo(db, {
      at: now.toISOString(),
      ids: touched,
      rows: touched.map((id) => before.get(id)!).filter(Boolean),
      links: links.filter((l) => mergedInto.has(l.collectionItemId ?? -1)).map(({ id, collectionItemId }) => ({ id, collectionItemId })),
    }),
  );
  await runBatch(db, statements);
  const changed = rows.filter((r) => updated.includes(r.id) || mergedInto.has(r.id));
  return { stacks: changed.length, copies: changed.reduce((n, r) => n + r.quantity, 0), merged: mergedInto.size, inDecks };
}

function saveUndo(db: Db, u: Undo) {
  const value = JSON.stringify(u);
  return db.insert(meta).values({ key: UNDO_KEY, value }).onConflictDoUpdate({ target: meta.key, set: { value } });
}

async function runBatch(db: Db, statements: BatchItem<"sqlite">[]) {
  const [first, ...rest] = statements;
  await db.batch([first, ...rest]);
}

/**
 * Put the stacks of the last bulk change back as they were (same IDs, so decks find their copies
 * again). Only once, and only the most recent change. Returns false when there's nothing to undo.
 */
export async function undoBulk(db: Db): Promise<boolean> {
  const [row] = await db.select().from(meta).where(eq(meta.key, UNDO_KEY));
  if (!row) return false;
  let u: Undo;
  try {
    u = JSON.parse(row.value) as Undo;
  } catch {
    return false;
  }
  const statements: BatchItem<"sqlite">[] = [];
  for (const c of chunks(u.ids)) statements.push(db.delete(collectionItems).where(inArray(collectionItems.id, c)));
  for (const c of chunks(u.rows, 100)) statements.push(db.insert(collectionItems).values(c));
  for (const l of u.links) statements.push(db.update(deckCards).set({ collectionItemId: l.collectionItemId }).where(eq(deckCards.id, l.id)));
  statements.push(db.delete(meta).where(eq(meta.key, UNDO_KEY)));
  await runBatch(db, statements);
  return true;
}

/** Rename a box or binder (or merge it into another by giving that one's name). Returns copies moved. */
export async function renamePlace(db: Db, from: string, to: string): Promise<BulkResult> {
  const name = to.trim();
  if (!from || !name || name === from) return { stacks: 0, copies: 0, merged: 0, inDecks: 0 };
  const ids = (await db.select({ id: collectionItems.id }).from(collectionItems).where(eq(collectionItems.location, from))).map((r) => r.id);
  return applyBulk(db, ids, { kind: "update", patch: { location: name } });
}

