import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import { collectionEvents } from "@/db/schema";
import { makeBackup, parseBackup, restoreBackup } from "@/lib/backup";
import { listActivity, soldTotals } from "@/lib/collection/activity";
import { forTradeList } from "@/lib/collection/for-trade";
import { parseFilters, queryCollection } from "@/lib/collection/query";
import { addCards, addPrinting, getItem, moveItem, removeItem, sellItem, setItemTags, setQuantity, sourceLabel } from "@/lib/collection/service";
import { addLine, tradeTotals, tradeVerdict } from "@/lib/collection/trade";
import { seededDb } from "./helpers";

const SOL_RING_C21 = "4cbc6901-6a4a-4d0a-83ea-7eefa3b35021";

let db: Db;
let cleanup: () => void;
beforeEach(async () => {
  ({ db, cleanup } = await seededDb());
});
afterEach(() => cleanup());

const kinds = async () => (await listActivity(db)).map((r) => [r.kind, r.quantity]).reverse();

describe("activity log", () => {
  it("notes adds, counts, moves and removals, newest first, with the card's name", async () => {
    const add = await addPrinting(db, { scryfallId: SOL_RING_C21, quantity: 3, location: "Binder 1" }, { source: "manual" });
    await setQuantity(db, add.itemId, 5);
    const moved = await moveItem(db, add.itemId, "Trade box", 2);
    await removeItem(db, moved!);
    expect(await kinds()).toEqual([
      ["add", 3],
      ["count", 2],
      ["move", 2],
      ["remove", -2],
    ]);
    const [latest, move] = await listActivity(db);
    expect(latest.name).toBe("Sol Ring");
    expect(move.detail).toBe("Binder 1 → Trade box");
    expect((await listActivity(db, { kind: "count" })).map((r) => r.quantity)).toEqual([2]);
  });

  it("notes a whole import as one line", async () => {
    await addCards(db, [{ identity: { scryfallId: SOL_RING_C21 }, quantity: 2, finish: "nonfoil" }, { identity: { scryfallId: SOL_RING_C21 }, quantity: 1, finish: "foil" }], { source: "csv:mythic-tools", batchId: 1 });
    const rows = await listActivity(db);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: "import", quantity: 3, detail: "Mythic Tools", oracleId: null });
    expect(sourceLabel("scanner")).toBe("Scanner");
  });

  it("sells copies, keeps the rest, and adds up what they fetched", async () => {
    const add = await addPrinting(db, { scryfallId: SOL_RING_C21, quantity: 3 }, { source: "manual" });
    expect(await sellItem(db, add.itemId, 2, 1.5, "  Local store ")).toBe(2);
    expect((await getItem(db, add.itemId))?.quantity).toBe(1);
    expect(await sellItem(db, add.itemId, 5, null)).toBe(1);
    expect(await getItem(db, add.itemId)).toBeUndefined();
    expect(await sellItem(db, add.itemId, 1, 1)).toBe(0);
    const sold = await listActivity(db, { kind: "sold" });
    expect(sold.map((r) => [r.quantity, r.priceUsd, r.detail])).toEqual([
      [-1, null, ""],
      [-2, 1.5, "Local store"],
    ]);
    expect(await soldTotals(db)).toEqual({ copies: 3, usd: 3 });
    expect(await soldTotals(db, "2999-01-01")).toEqual({ copies: 0, usd: 0 });
  });
});

describe("tags and the for-trade list", () => {
  it("cleans tags, finds them with tag: and is:trade, and lists stacks for trade", async () => {
    const a = await addPrinting(db, { scryfallId: SOL_RING_C21, quantity: 2 }, { source: "manual" });
    await setItemTags(db, a.itemId, [" Trade ", "cube", "trade", "", "Cube"]);
    expect((await getItem(db, a.itemId))?.tags).toEqual(["Trade", "cube", "trade", "Cube"]);
    await setItemTags(db, a.itemId, ["trade", "cube"]);
    const names = async (q: string) => (await queryCollection(db, parseFilters({ q }))).cards.map((c) => c.name);
    expect(await names("tag:CUBE")).toEqual(["Sol Ring"]);
    expect(await names("is:trade")).toEqual(["Sol Ring"]);
    expect(await names("tag:lent")).toEqual([]);
    const list = await forTradeList(db);
    expect(list.map((l) => [l.name, l.quantity])).toEqual([["Sol Ring", 2]]);
    await setItemTags(db, a.itemId, []);
    expect((await getItem(db, a.itemId))?.tags).toBeNull();
    expect(await forTradeList(db)).toEqual([]);
  });

  it("keeps tags and the activity log in a backup", async () => {
    const a = await addPrinting(db, { scryfallId: SOL_RING_C21, quantity: 2 }, { source: "manual" });
    await setItemTags(db, a.itemId, ["trade"]);
    await sellItem(db, a.itemId, 1, 2);
    const parsed = parseBackup(JSON.stringify(await makeBackup(db)));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const other = await seededDb();
    try {
      expect((await restoreBackup(other.db, parsed.backup, { online: false })).ok).toBe(true);
      expect((await forTradeList(other.db)).map((l) => l.quantity)).toEqual([1]);
      expect((await other.db.select().from(collectionEvents)).map((e) => e.kind)).toEqual(["add", "sold"]);
    } finally {
      other.cleanup();
    }
  });
});

describe("trade calculator", () => {
  const ring = { oracleId: "r", name: "Ring", priceUsd: 10 };
  const orb = { oracleId: "o", name: "Orb", priceUsd: 4.25 };
  const odd = { oracleId: "x", name: "Odd", priceUsd: null };

  it("adds a card, or one more copy when it's there", () => {
    expect(addLine(addLine([], ring), ring)).toEqual([{ ...ring, quantity: 2 }]);
  });

  it("adds up each side, leaves out unpriced cards, and calls near-even trades even", () => {
    const t = tradeTotals([{ ...ring, quantity: 1 }], [{ ...orb, quantity: 2 }, { ...odd, quantity: 1 }]);
    expect(t).toEqual({ give: 10, get: 8.5, difference: -1.5, unpriced: 1 });
    expect(tradeVerdict(t)).toBe("they-ahead");
    expect(tradeVerdict(tradeTotals([{ ...ring, quantity: 1 }], [{ ...orb, quantity: 3 }]))).toBe("you-ahead");
    expect(tradeVerdict(tradeTotals([{ ...ring, quantity: 1 }], [{ ...ring, priceUsd: 9.5, quantity: 1 }]))).toBe("even");
  });
});
