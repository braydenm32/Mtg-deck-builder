import { beforeEach, afterEach, describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import { collectionItems, deckCards, decks } from "@/db/schema";
import { applyBulk, previewBulk, renamePlace, undoBulk } from "@/lib/collection/bulk";
import { placesSummary } from "@/lib/collection/places";
import { matchingStackIds, parseFilters } from "@/lib/collection/query";
import { addCards, addPrinting } from "@/lib/collection/service";
import { seededDb } from "./helpers";

let db: Db;
let cleanup: () => void;
const SOL = "4cbc6901-6a4a-4d0a-83ea-7eefa3b35021";

beforeEach(async () => {
  ({ db, cleanup } = await seededDb());
  await addPrinting(db, { scryfallId: SOL, quantity: 2, condition: "NM", location: "Box A" }, { source: "manual" });
  await addPrinting(db, { scryfallId: SOL, quantity: 1, condition: "NM", location: "Binder" }, { source: "manual" });
  await addPrinting(db, { scryfallId: SOL, quantity: 1, condition: "NM", location: "" }, { source: "manual" });
  await addCards(db, [{ identity: { name: "Lightning Bolt" }, quantity: 3, finish: "nonfoil", location: "Box A" }], { source: "manual" }, { online: false });
});
afterEach(() => cleanup());

const all = async () => (await db.select().from(collectionItems)).sort((a, b) => a.id - b.id);
const snapshot = async () => (await all()).map((r) => `${r.id}:${r.quantity}:${r.location}:${r.condition}:${r.proxy}`);

async function holdInDeck(itemId: number, oracleId: string) {
  const [deck] = await db.insert(decks).values({ name: "D", commanderOracleId: oracleId, status: "building", createdAt: "t", updatedAt: "t" }).returning();
  const [dc] = await db.insert(deckCards).values({ deckId: deck.id, oracleId, collectionItemId: itemId }).returning();
  return dc.id;
}

describe("bulk changes", () => {
  it("moves stacks, merging into an identical stack and keeping deck copies with them", async () => {
    const rows = await all();
    const boxA = rows.find((r) => r.location === "Box A" && r.printingId === SOL)!;
    const dcId = await holdInDeck(boxA.id, boxA.oracleId);
    const res = await applyBulk(db, [boxA.id], { kind: "update", patch: { location: "Binder" } });
    expect(res).toMatchObject({ stacks: 1, copies: 2, merged: 1, inDecks: 1 });
    const binder = (await all()).find((r) => r.location === "Binder" && r.printingId === SOL)!;
    expect(binder.quantity).toBe(3);
    const [dc] = await db.select().from(deckCards);
    expect(dc).toMatchObject({ id: dcId, collectionItemId: binder.id });
  });

  it("sets condition and proxy on many stacks, and undo puts everything back", async () => {
    const before = await snapshot();
    const ids = (await all()).map((r) => r.id);
    const res = await applyBulk(db, ids, { kind: "update", patch: { condition: "Lightly Played", proxy: true } });
    expect(res.stacks).toBe(4);
    expect((await all()).every((r) => r.condition === "LP" && r.proxy)).toBe(true);
    expect(await undoBulk(db)).toBe(true);
    expect(await snapshot()).toEqual(before);
    expect(await undoBulk(db)).toBe(false);
  });

  it("undoes a merge, giving decks their old stack back", async () => {
    const rows = await all();
    const boxA = rows.find((r) => r.location === "Box A" && r.printingId === SOL)!;
    await holdInDeck(boxA.id, boxA.oracleId);
    const before = await snapshot();
    await applyBulk(db, [boxA.id], { kind: "update", patch: { location: "Binder" } });
    await undoBulk(db);
    expect(await snapshot()).toEqual(before);
    expect((await db.select().from(deckCards))[0].collectionItemId).toBe(boxA.id);
  });

  it("removes stacks, freeing deck links, and undo restores both", async () => {
    const rows = await all();
    const dcId = await holdInDeck(rows[0].id, rows[0].oracleId);
    const before = await snapshot();
    expect(await previewBulk(db, [rows[0].id, rows[1].id])).toMatchObject({ stacks: 2, copies: 3, inDecks: 1 });
    const res = await applyBulk(db, [rows[0].id, rows[1].id], { kind: "remove" });
    expect(res).toMatchObject({ stacks: 2, copies: 3, inDecks: 1 });
    expect(await all()).toHaveLength(2);
    expect((await db.select().from(deckCards))[0].collectionItemId).toBeNull();
    await undoBulk(db);
    expect(await snapshot()).toEqual(before);
    expect((await db.select().from(deckCards)).find((d) => d.id === dcId)?.collectionItemId).toBe(rows[0].id);
  });

  it("renames a box, merging into an existing one", async () => {
    const res = await renamePlace(db, "Box A", "Binder");
    expect(res.copies).toBe(5);
    const { places, needsHome } = await placesSummary(db);
    expect(places.map((p) => [p.location, p.copies, p.cards])).toEqual([["Binder", 6, 2]]);
    expect(needsHome).toBe(1);
  });

  it("finds the stacks a filtered view shows", async () => {
    expect(await matchingStackIds(db, parseFilters({ loc: "Box A" }))).toHaveLength(2);
    expect(await matchingStackIds(db, parseFilters({ nohome: "1" }))).toHaveLength(1);
    const bolt = (await all()).find((r) => r.printingId !== SOL)!;
    expect(await matchingStackIds(db, parseFilters({ loc: "Box A" }), [bolt.oracleId])).toEqual([bolt.id]);
    expect(await matchingStackIds(db, parseFilters({}), [])).toEqual([]);
  });
});
