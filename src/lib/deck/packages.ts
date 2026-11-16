import { and, asc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db/client";
import { cards, deckCards, decks, packageCards, packages } from "@/db/schema";
import { placeCopies, primaryRoleOf } from "./store";

/**
 * Card packages: a named group of cards (a removal suite, a combo, a land pack) you can drop into any
 * deck in one go. Adding skips cards outside the deck's colours and cards already in it, and can be
 * undone.
 */

export type Package = typeof packages.$inferSelect;

export const packageSchema = z.object({
  name: z.string().trim().min(1).max(80),
  notes: z.string().trim().max(500).default(""),
  oracleIds: z.array(z.string().min(1)).max(100).default([]),
});

const now = () => new Date().toISOString();

const fits = (cardIdentity: string, deckIdentity: string) => [...cardIdentity].every((c) => deckIdentity.includes(c));

export async function createPackage(db: Db, input: z.input<typeof packageSchema>): Promise<Package> {
  const p = packageSchema.parse(input);
  const [row] = await db.insert(packages).values({ name: p.name, notes: p.notes, createdAt: now(), updatedAt: now() }).returning();
  await addPackageCards(db, row.id, p.oracleIds);
  return row;
}

export async function updatePackage(db: Db, id: number, patch: { name?: string; notes?: string }) {
  const set: Partial<Package> = { updatedAt: now() };
  if (patch.name?.trim()) set.name = patch.name.trim().slice(0, 80);
  if (patch.notes !== undefined) set.notes = patch.notes.trim().slice(0, 500);
  await db.update(packages).set(set).where(eq(packages.id, id));
}

export async function deletePackage(db: Db, id: number) {
  await db.batch([db.delete(packageCards).where(eq(packageCards.packageId, id)), db.delete(packages).where(eq(packages.id, id))]);
}

/** Add cards (ones the card data doesn't know are left out). */
export async function addPackageCards(db: Db, id: number, oracleIds: string[]) {
  const ids = [...new Set(oracleIds)];
  if (!ids.length) return;
  const known = (await db.select({ id: cards.oracleId }).from(cards).where(inArray(cards.oracleId, ids))).map((r) => r.id);
  if (!known.length) return;
  await db.batch([
    db
      .insert(packageCards)
      .values(known.map((oracleId) => ({ packageId: id, oracleId })))
      .onConflictDoNothing(),
    db.update(packages).set({ updatedAt: now() }).where(eq(packages.id, id)),
  ]);
}

export async function removePackageCard(db: Db, id: number, oracleId: string) {
  await db.delete(packageCards).where(and(eq(packageCards.packageId, id), eq(packageCards.oracleId, oracleId)));
}

export type PackageCard = { oracleId: string; name: string; typeLine: string; manaCost: string | null; cmc: number; colorIdentity: string; imageSmall: string | null };

async function cardsOf(db: Db, ids: number[]) {
  if (!ids.length) return new Map<number, PackageCard[]>();
  const rows = await db
    .select({
      packageId: packageCards.packageId,
      oracleId: cards.oracleId,
      name: cards.name,
      typeLine: cards.typeLine,
      manaCost: cards.manaCost,
      cmc: cards.cmc,
      colorIdentity: cards.colorIdentity,
      imageSmall: cards.imageSmall,
    })
    .from(packageCards)
    .innerJoin(cards, eq(cards.oracleId, packageCards.oracleId))
    .where(inArray(packageCards.packageId, ids))
    .orderBy(asc(cards.cmc), asc(cards.name));
  const out = new Map<number, PackageCard[]>();
  for (const { packageId, ...c } of rows) out.set(packageId, [...(out.get(packageId) ?? []), c]);
  return out;
}

const identityOf = (list: PackageCard[]) => "WUBRG".split("").filter((c) => list.some((x) => x.colorIdentity.includes(c))).join("");

export type PackageView = Package & { cards: PackageCard[]; colorIdentity: string };

export async function listPackages(db: Db): Promise<PackageView[]> {
  const list = await db.select().from(packages).orderBy(sql`${packages.updatedAt} DESC`);
  const byId = await cardsOf(
    db,
    list.map((p) => p.id),
  );
  return list.map((p) => {
    const c = byId.get(p.id) ?? [];
    return { ...p, cards: c, colorIdentity: identityOf(c) };
  });
}

export async function getPackage(db: Db, id: number): Promise<PackageView | undefined> {
  const [p] = await db.select().from(packages).where(eq(packages.id, id));
  if (!p) return undefined;
  const c = (await cardsOf(db, [id])).get(id) ?? [];
  return { ...p, cards: c, colorIdentity: identityOf(c) };
}

/** Your own tags on deck cards, each with its deck: a package can start from one ("Wincon" in Korvold). */
export async function deckTags(db: Db): Promise<{ deckId: number; deckName: string; tag: string; oracleIds: string[] }[]> {
  const rows = await db
    .select({ deckId: deckCards.deckId, deckName: decks.name, oracleId: deckCards.oracleId, tags: deckCards.tags })
    .from(deckCards)
    .innerJoin(decks, eq(decks.id, deckCards.deckId))
    .where(and(isNotNull(deckCards.tags), inArray(deckCards.board, ["main", "maybe"])));
  const m = new Map<string, { deckId: number; deckName: string; tag: string; oracleIds: string[] }>();
  for (const r of rows) {
    for (const tag of r.tags ?? []) {
      const key = `${r.deckId}\u0000${tag}`;
      const cur = m.get(key) ?? { deckId: r.deckId, deckName: r.deckName, tag, oracleIds: [] };
      cur.oracleIds.push(r.oracleId);
      m.set(key, cur);
    }
  }
  return [...m.values()].sort((a, b) => a.deckName.localeCompare(b.deckName) || a.tag.localeCompare(b.tag));
}

/** What adding a package did, and what Undo needs to put the deck back. */
export type PackageAdd = {
  added: string[];
  offColour: string[];
  already: string[];
  undo: { inserted: number[]; moved: { id: number; board: string; locked: boolean; addedBy: string; reason: string }[] };
};

/**
 * Put a package's cards in a deck's main board. Cards outside the deck's colours, and cards already
 * in the 99 or the command zone, are skipped; a card on the Maybe list or among the suggestions moves
 * to the 99. Added cards are locked, like any card you add, so a rebuild keeps them.
 */
export async function addPackageToDeck(db: Db, packageId: number, deckId: number): Promise<PackageAdd | undefined> {
  const [deck] = await db.select({ identity: decks.colorIdentity }).from(decks).where(eq(decks.id, deckId));
  const pkg = await getPackage(db, packageId);
  if (!deck || !pkg) return undefined;
  const ids = pkg.cards.map((c) => c.oracleId);
  const existing = ids.length ? await db.select().from(deckCards).where(and(eq(deckCards.deckId, deckId), inArray(deckCards.oracleId, ids))) : [];
  const full = ids.length ? await db.select().from(cards).where(inArray(cards.oracleId, ids)) : [];
  const out: PackageAdd = { added: [], offColour: [], already: [], undo: { inserted: [], moved: [] } };
  const inserts: (typeof deckCards.$inferInsert)[] = [];
  for (const c of pkg.cards) {
    const rows = existing.filter((r) => r.oracleId === c.oracleId);
    if (rows.some((r) => r.board === "main" || r.board === "commander")) {
      out.already.push(c.name);
      continue;
    }
    if (!fits(c.colorIdentity, deck.identity)) {
      out.offColour.push(c.name);
      continue;
    }
    out.added.push(c.name);
    const other = rows[0];
    if (other) {
      out.undo.moved.push({ id: other.id, board: other.board, locked: other.locked, addedBy: other.addedBy, reason: other.reason });
      await db.update(deckCards).set({ board: "main", locked: true, addedBy: "user", reason: `From the ${pkg.name} package` }).where(eq(deckCards.id, other.id));
    } else {
      const card = full.find((x) => x.oracleId === c.oracleId)!;
      inserts.push({ deckId, oracleId: c.oracleId, quantity: 1, board: "main", role: primaryRoleOf(card), locked: true, addedBy: "user", reason: `From the ${pkg.name} package` });
    }
  }
  if (inserts.length) out.undo.inserted = (await db.insert(deckCards).values(inserts).returning({ id: deckCards.id })).map((r) => r.id);
  if (out.added.length) {
    await db.update(decks).set({ updatedAt: now() }).where(eq(decks.id, deckId));
    await placeCopies(db, deckId);
  }
  return out;
}

export const undoSchema = z.object({
  inserted: z.array(z.number().int()).max(100),
  moved: z.array(z.object({ id: z.number().int(), board: z.string(), locked: z.boolean(), addedBy: z.string(), reason: z.string() })).max(100),
});

/** Take a package back out of a deck (Undo). */
export async function undoPackageAdd(db: Db, deckId: number, undo: PackageAdd["undo"]) {
  if (undo.inserted.length) await db.delete(deckCards).where(and(eq(deckCards.deckId, deckId), inArray(deckCards.id, undo.inserted)));
  for (const m of undo.moved) {
    await db.update(deckCards).set({ board: m.board, locked: m.locked, addedBy: m.addedBy, reason: m.reason }).where(and(eq(deckCards.id, m.id), eq(deckCards.deckId, deckId)));
  }
  await db.update(decks).set({ updatedAt: now() }).where(eq(decks.id, deckId));
  await placeCopies(db, deckId);
}

