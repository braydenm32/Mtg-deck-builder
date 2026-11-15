import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import { collectionItems } from "@/db/schema";
import { addCards, addPrinting, ownedCount, setQuantity } from "@/lib/collection/service";
import { seededDb } from "./helpers";

let db: Db;
let cleanup: () => void;
beforeAll(async () => ({ db, cleanup } = await seededDb()));
afterAll(() => cleanup());

const SOL_RING_C21 = "4cbc6901-6a4a-4d0a-83ea-7eefa3b35021";

describe("collection", () => {
  it("adds a known printing and merges identical stacks", async () => {
    const a = await addPrinting(db, { scryfallId: SOL_RING_C21, quantity: 1, condition: "Near Mint" }, { source: "scanner" });
    const b = await addPrinting(db, { scryfallId: SOL_RING_C21, quantity: 2, condition: "NM" }, { source: "scanner" });
    expect(b.itemId).toBe(a.itemId);
    expect(b.quantity).toBe(3);
  });

  it("keeps different finishes and locations as separate stacks", async () => {
    await addPrinting(db, { scryfallId: SOL_RING_C21, finish: "foil" }, { source: "manual" });
    await addPrinting(db, { scryfallId: SOL_RING_C21, location: "Binder 1" }, { source: "manual" });
    const rows = await db.select().from(collectionItems);
    expect(rows.length).toBe(3);
    const sol = rows[0].oracleId;
    expect(await ownedCount(db, sol)).toBe(5);
  });

  it("falls back to a finish the printing exists in", async () => {
    // Lightning Bolt M10 was printed nonfoil and foil, not etched.
    const res = await addCards(
      db,
      [{ identity: { name: "Lightning Bolt", setCode: "m10" }, quantity: 1, finish: "etched" }],
      { source: "manual" },
      { online: false },
    );
    const [row] = (await db.select().from(collectionItems)).filter((r) => r.id === res.added[0].itemId);
    expect(row.finish).toBe("foil");
  });

  it("reports unmatched entries without storing them", async () => {
    const before = (await db.select().from(collectionItems)).length;
    const res = await addCards(
      db,
      [{ identity: { name: "Totally Fake Card" }, quantity: 1, finish: "nonfoil" }],
      { source: "manual" },
      { online: false },
    );
    expect(res.unmatched[0].reason).toMatch(/Totally Fake Card/);
    expect((await db.select().from(collectionItems)).length).toBe(before);
  });

  it("sets and removes quantities", async () => {
    const { itemId } = await addPrinting(db, { scryfallId: SOL_RING_C21, location: "Deck box" }, { source: "manual" });
    await setQuantity(db, itemId, 4);
    expect((await db.select().from(collectionItems)).find((r) => r.id === itemId)?.quantity).toBe(4);
    await setQuantity(db, itemId, 0);
    expect((await db.select().from(collectionItems)).find((r) => r.id === itemId)).toBeUndefined();
  });
});
