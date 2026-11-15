import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { collectionItems } from "@/db/schema";
import { cardsNeedingAHome } from "@/lib/collection/needs-home";
import { addPrinting } from "@/lib/collection/service";
import { seededDb } from "./helpers";

const SOL_RING = "4cbc6901-6a4a-4d0a-83ea-7eefa3b35021";
const ATRAXA = "d0d33d52-3d28-4635-b985-51e126289259";
const VISCERA_SEER = "f511830b-1c1f-4d30-aa5d-4314726d142e";
const KORVOLD = "607c1793-8e5a-4ebf-87c6-7f9c99bbd29a";

let db: Db;
let cleanup: () => void;
beforeAll(async () => ({ db, cleanup } = await seededDb()));
afterAll(() => cleanup());

describe("cardsNeedingAHome", () => {
  it("is zero for an empty collection", async () => {
    expect(await cardsNeedingAHome(db)).toEqual({ copies: 0, cardCount: 0, cards: [] });
  });

  it("counts copies with no location, leaving out proxies and cards that have a home", async () => {
    // Needs a home: 2 Sol Ring (two stacks, one foil) and 1 Atraxa.
    await addPrinting(db, { scryfallId: SOL_RING }, { source: "scanner" });
    await addPrinting(db, { scryfallId: SOL_RING, finish: "foil" }, { source: "scanner" });
    await addPrinting(db, { scryfallId: ATRAXA }, { source: "manual" });
    // Has a home, or is a proxy: not counted.
    await addPrinting(db, { scryfallId: VISCERA_SEER, quantity: 3, location: "Box: Bulk" }, { source: "manual" });
    await addPrinting(db, { scryfallId: KORVOLD, proxy: true }, { source: "manual" });
    // Whitespace-only locations are stored as "", so they need a home too.
    await addPrinting(db, { scryfallId: VISCERA_SEER, location: "   " }, { source: "scanner" });

    const r = await cardsNeedingAHome(db);
    expect(r.copies).toBe(4);
    expect(r.cardCount).toBe(3);
    expect(r.cards.map((c) => [c.name, c.copies]).sort()).toEqual([
      ["Atraxa, Praetors' Voice", 1],
      ["Sol Ring", 2],
      ["Viscera Seer", 1],
    ]);

    // Matches the audit's check query (N6), with proxies left out as Part B says.
    const [check] = await db.all<{ copies: number }>(
      sql`SELECT COALESCE(SUM(quantity), 0) AS copies FROM collection_items WHERE location = '' AND proxy = 0`,
    );
    expect(Number(check.copies)).toBe(r.copies);
  });

  it("lists the most recently added first and respects the limit", async () => {
    await db.update(collectionItems).set({ addedAt: "2020-01-01T00:00:00.000Z" });
    await db.update(collectionItems).set({ addedAt: "2030-01-01T00:00:00.000Z" }).where(sql`${collectionItems.oracleId} = (SELECT oracle_id FROM printings WHERE id = ${ATRAXA})`);
    const r = await cardsNeedingAHome(db, 2);
    expect(r.cards).toHaveLength(2);
    expect(r.cards[0].name).toBe("Atraxa, Praetors' Voice");
    // The totals still cover every card, not just the ones listed.
    expect(r).toMatchObject({ copies: 4, cardCount: 3 });
  });
});
