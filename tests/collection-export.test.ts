import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import { collectionItems, deckCards, decks } from "@/db/schema";
import { makeBackup, parseBackup, restoreBackup } from "@/lib/backup";
import { exportCollectionCsv } from "@/lib/collection/export";
import { importCollection } from "@/lib/collection/import";
import { addCards, addPrinting } from "@/lib/collection/service";
import { parseCollectionCsv } from "@/lib/ingest/csv";
import { saveSettings, getSettings } from "@/lib/settings";
import { seededDb, tempDb } from "./helpers";

let db: Db;
let cleanup: () => void;
beforeAll(async () => {
  ({ db, cleanup } = await seededDb());
  await addPrinting(db, { scryfallId: SOL_RING_C21, quantity: 2, condition: "NM", location: "Box A", purchasePrice: 1.5 }, { source: "scanner" });
  await addPrinting(db, { scryfallId: SOL_RING_C21, finish: "nonfoil", lang: "ja", proxy: true }, { source: "manual" });
  await addCards(db, [{ identity: { name: "Lightning Bolt" }, quantity: 3, finish: "foil", condition: "LP", location: "Binder 1" }], { source: "manual" }, { online: false });
});
afterAll(() => cleanup());

const SOL_RING_C21 = "4cbc6901-6a4a-4d0a-83ea-7eefa3b35021";

const stacks = async (d: Db) =>
  (await d.select().from(collectionItems))
    .map((r) => [r.printingId, r.quantity, r.finish, r.condition, r.lang, r.location, r.proxy, r.printingConfidence, r.purchasePrice].join("|"))
    .sort();

describe("collection export", () => {
  it("writes our own CSV that imports back to the same stacks, guesses included", async () => {
    const csv = await exportCollectionCsv(db, "tutor");
    expect(csv.split("\n")[0]).toContain("Printing Confidence");
    const parsed = parseCollectionCsv(csv);
    expect(parsed.source).toBe("deck-tutor");
    expect(parsed.rows).toHaveLength(3);

    const fresh = await seededDb();
    try {
      await importCollection(fresh.db, { text: csv, mode: "add" });
      expect(await stacks(fresh.db)).toEqual(await stacks(db));
    } finally {
      fresh.cleanup();
    }
  });

  it("writes Moxfield and ManaBox layouts that this app's importer recognises", async () => {
    const mox = await exportCollectionCsv(db, "moxfield");
    const m = parseCollectionCsv(mox);
    expect(m.source).toBe("moxfield");
    expect(m.rows.map((r) => r.entry.quantity).sort()).toEqual([1, 2, 3]);
    expect(mox).toContain("Near Mint");
    expect(mox).toContain("Japanese");

    const mb = await exportCollectionCsv(db, "manabox");
    const b = parseCollectionCsv(mb);
    expect(b.source).toBe("manabox");
    expect(b.rows.find((r) => r.entry.quantity === 3)?.entry).toMatchObject({ finish: "foil", location: "Binder 1", condition: "lightly_played" });
  });

  it("writes just the header for an empty collection", async () => {
    const t = await tempDb();
    try {
      const csv = await exportCollectionCsv(t.db, "tutor");
      expect(csv.trim().split("\n")).toHaveLength(1);
      expect(csv).toContain("Scryfall ID");
    } finally {
      t.cleanup();
    }
  });
});

describe("backup", () => {
  it("restores the collection, decks (with the copies they hold) and settings into another database", async () => {
    const [stack] = await db.select().from(collectionItems);
    const now = new Date().toISOString();
    const [deck] = await db
      .insert(decks)
      .values({ name: "Test deck", commanderOracleId: stack.oracleId, status: "building", createdAt: now, updatedAt: now })
      .returning();
    await db.insert(deckCards).values({ deckId: deck.id, oracleId: stack.oracleId, collectionItemId: stack.id, board: "main" });
    await saveSettings(db, { currency: "AUD" });

    const text = JSON.stringify(await makeBackup(db));
    const parsed = parseBackup(text);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.counts).toMatchObject({ stacks: 3, copies: 6, decks: 1, deckCards: 1 });

    const other = await seededDb();
    try {
      await addPrinting(other.db, { scryfallId: SOL_RING_C21, quantity: 9 }, { source: "manual" });
      const res = await restoreBackup(other.db, parsed.backup, { online: false });
      expect(res.ok).toBe(true);
      expect(await stacks(other.db)).toEqual(await stacks(db));
      const [dc] = await other.db.select().from(deckCards);
      expect(dc.collectionItemId).toBe(stack.id);
      expect((await getSettings(other.db)).currency).toBe("AUD");
    } finally {
      other.cleanup();
    }
  });

  it("changes nothing when the backup has printings the card data can't find", async () => {
    const b = await makeBackup(db);
    const empty = await tempDb();
    try {
      await empty.db.insert(decks).values({ name: "Keep me", commanderOracleId: "x", status: "idea", createdAt: "t", updatedAt: "t" });
      const res = await restoreBackup(empty.db, b, { online: false });
      expect(res.ok).toBe(false);
      expect(await empty.db.select().from(decks)).toHaveLength(1);
    } finally {
      empty.cleanup();
    }
  });

  it("says what's wrong with a file that isn't a backup", () => {
    expect(parseBackup("not json")).toMatchObject({ ok: false });
    expect(parseBackup('{"format":"other"}')).toMatchObject({ ok: false, error: expect.stringContaining("isn’t an MTG Deck Tutor backup") });
    expect(parseBackup(JSON.stringify({ format: "mtg-deck-tutor-backup", version: 1, exportedAt: "x", collection: [{ id: 1 }], decks: [], deckCards: [] }))).toMatchObject({
      ok: false,
      error: expect.stringContaining("damaged"),
    });
  });
});
