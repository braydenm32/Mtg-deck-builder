import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import { collectionItems, deckCards } from "@/db/schema";
import { getBatch, importCollection } from "@/lib/collection/import";
import { addPrinting, moveItem } from "@/lib/collection/service";
import { storeScryfallCards } from "@/lib/cards/store";
import { FIXTURE_JA, seededDb } from "./helpers";

const csv = (name: string) => fs.readFileSync(path.join(__dirname, "fixtures", "csv", `${name}.csv`), "utf8");

let db: Db;
let cleanup: () => void;
beforeEach(async () => {
  ({ db, cleanup } = await seededDb());
  // A Japanese printing, as if fetched earlier from Scryfall (it isn't in the default_cards bulk file).
  await storeScryfallCards(db, [JSON.parse(fs.readFileSync(FIXTURE_JA, "utf8"))]);
});
afterEach(() => cleanup());

describe("importCollection", () => {
  it.each(["mythic-tools", "manabox", "moxfield", "archidekt", "deckbox", "tcgplayer-app", "generic"])(
    "%s matches every row",
    async (file) => {
      const s = await importCollection(db, { text: csv(file), online: false });
      expect(s.errors).toEqual([]);
      expect(s.unmatched).toBe(0);
      expect(s.matched).toBe(s.rows);
    },
  );

  it("records unmatched rows for review", async () => {
    const s = await importCollection(db, { text: csv("delver-lens"), filename: "delver.csv", online: false });
    expect(s).toMatchObject({ source: "csv:delver-lens", matched: 1, unmatched: 1 });
    const b = await getBatch(db, s.batchId);
    expect(b?.batch.filename).toBe("delver.csv");
    expect(b?.misses[0]).toMatchObject({ name: "Not A Real Card", setCode: "XYZ", quantity: 2, rowNumber: 3 });
    // What the import did is kept on the batch.
    expect(b?.result).toMatchObject({ rows: 2, matched: 1, unmatched: 1, exact: 1, guessed: 0 });
    expect(b?.open).toBe(1);

    // Marking the row done (and undoing that).
    const { resolveMiss } = await import("@/lib/collection/import");
    expect(await resolveMiss(db, s.batchId, b!.misses[0].id, "not-owned")).toMatchObject({ resolution: "not-owned" });
    expect((await getBatch(db, s.batchId))?.open).toBe(0);
    expect(await resolveMiss(db, s.batchId + 1, b!.misses[0].id, "added")).toBeUndefined(); // wrong batch
    await resolveMiss(db, s.batchId, b!.misses[0].id, null);
    expect((await getBatch(db, s.batchId))?.misses[0].resolvedAt).toBeNull();
  });

  it("keeps the language from the file even when only an English printing is known", async () => {
    const text = `Name,Edition,Collector Number,Language,Count\nSol Ring,c21,263,German,1\n`;
    const s = await importCollection(db, { text, online: false });
    expect(s.matched).toBe(1);
    const [row] = await db.select().from(collectionItems);
    expect(row).toMatchObject({ lang: "de", printingId: "4cbc6901-6a4a-4d0a-83ea-7eefa3b35021" });
  });

  it("matches a non-English printing by Scryfall ID", async () => {
    await importCollection(db, { text: csv("mythic-tools"), online: false });
    const rows = await db.select().from(collectionItems);
    expect(rows.find((r) => r.printingId === "d35f6ec2-7b39-458a-8600-c948c438252a")?.lang).toBe("ja");
  });

  it("replace-source swaps an app's cards but keeps scanned ones", async () => {
    await addPrinting(db, { scryfallId: "607c1793-8e5a-4ebf-87c6-7f9c99bbd29a" }, { source: "scanner" });
    await importCollection(db, { text: csv("mythic-tools"), online: false });
    await importCollection(db, { text: csv("mythic-tools"), online: false, mode: "replace-source" });
    const rows = await db.select().from(collectionItems);
    const total = (src: string) => rows.filter((r) => r.source === src).reduce((n, r) => n + r.quantity, 0);
    expect(total("csv:mythic-tools")).toBe(5); // not doubled
    expect(total("scanner")).toBe(1);
  });

  it("imports a pasted card list", async () => {
    const s = await importCollection(db, { text: "4 Sol Ring\n1 Jotun Grunt\n", online: false });
    expect(s).toMatchObject({ source: "text", matched: 2, copies: 5 });
  });
});

describe("re-importing (update) and undo", () => {
  const v1 = "Name,Edition,Collector Number,Count,Foil\nSol Ring,c21,263,2,\nLightning Bolt,m10,146,1,foil\nViscera Seer,soc,229,1,\n";
  const v2 = "Name,Edition,Collector Number,Count,Foil\nSol Ring,c21,263,3,\nLightning Bolt,m10,146,1,foil\nKorvold; Fae-Cursed King,eoc,120,1,\n".replace(
    "Korvold; Fae-Cursed King",
    '"Korvold, Fae-Cursed King"',
  );

  it("suggests update, previews the diff, keeps stack IDs and doesn't double", async () => {
    const { previewImport } = await import("@/lib/collection/import");
    await importCollection(db, { text: v1, online: false });
    const before = await db.select().from(collectionItems);
    const bolt = before.find((r) => r.finish === "foil")!;

    const p = await previewImport(db, { text: v2 });
    expect(p.suggestedMode).toBe("update");
    expect(p.diff).toMatchObject({ added: 1, changed: 1, removed: 1, unchanged: 1, copiesBefore: 4, copiesAfter: 5 });

    const s = await importCollection(db, { text: v2, mode: "update", online: false });
    expect(s.diff).toMatchObject({ added: 1, changed: 1, removed: 1 });
    expect((await getBatch(db, s.batchId))?.result?.diff).toMatchObject({ added: 1, changed: 1, removed: 1, copiesBefore: 4, copiesAfter: 5 });
    const after = await db.select().from(collectionItems);
    expect(after.reduce((n, r) => n + r.quantity, 0)).toBe(5);
    expect(after.find((r) => r.finish === "foil")!.id).toBe(bolt.id); // unchanged stack kept its id

    // Importing the same file again changes nothing.
    await importCollection(db, { text: v2, mode: "update", online: false });
    expect((await db.select().from(collectionItems)).reduce((n, r) => n + r.quantity, 0)).toBe(5);
  });

  it("undo restores the previous state and leaves other sources alone", async () => {
    const { undoImport, canUndo } = await import("@/lib/collection/import");
    await importCollection(db, { text: v1, online: false });
    const snapshot = (await db.select().from(collectionItems)).map((r) => [r.id, r.quantity]);
    await addPrinting(db, { scryfallId: "607c1793-8e5a-4ebf-87c6-7f9c99bbd29a" }, { source: "scanner" });
    const s = await importCollection(db, { text: v2, mode: "update", online: false });
    expect(await canUndo(db, s.batchId)).toBe(true);
    expect(await undoImport(db, s.batchId)).toBe(true);
    const rows = await db.select().from(collectionItems);
    expect(rows.filter((r) => r.source !== "scanner").map((r) => [r.id, r.quantity])).toEqual(snapshot);
    expect(rows.filter((r) => r.source === "scanner")).toHaveLength(1);
    expect(await canUndo(db, s.batchId)).toBe(false); // only once
  });

  it("scanned copies of the same printing stay a separate stack", async () => {
    await addPrinting(db, { scryfallId: "4cbc6901-6a4a-4d0a-83ea-7eefa3b35021" }, { source: "scanner" });
    await importCollection(db, { text: v1, online: false });
    const sol = (await db.select().from(collectionItems)).filter((r) => r.printingId === "4cbc6901-6a4a-4d0a-83ea-7eefa3b35021");
    expect(sol.map((r) => [r.source, r.quantity]).sort()).toEqual([["csv:generic", 2], ["scanner", 1]]);
  });
});

describe("match review cases", () => {
  it("sends a row to review when its name and number disagree", async () => {
    const s = await importCollection(db, { text: "Name,Edition,Collector Number,Count\nLightning Bolt,c21,263,1\n", online: false });
    expect(s.unmatched).toBe(1);
    const b = await getBatch(db, s.batchId);
    expect(b!.misses[0].reason).toMatch(/Name and number disagree: C21 #263 is Sol Ring/);
  });

  it("notes which printing was used when the stated one doesn't exist", async () => {
    await importCollection(db, { text: "Name,Edition,Collector Number,Count\nSol Ring,zzz,999,1\n", online: false });
    const [row] = await db.select().from(collectionItems);
    expect(row.printingConfidence).toBe("guessed");
    expect(row.matchNote).toMatch(/No ZZZ #999 found; used C21 #263/);
  });

  it("keeps the places you set in the app when the file only differs in place", async () => {
    const { previewImport } = await import("@/lib/collection/import");
    const file = (sol: number) => `Name,Edition,Collector Number,Count,Location\nSol Ring,c21,263,${sol},bulk\nViscera Seer,soc,229,1,bulk\n`;
    await importCollection(db, { text: file(2), online: false });
    const rows = () => db.select().from(collectionItems).then((r) => r.sort((a, b) => a.id - b.id));
    const [sol, seer] = await rows();
    await moveItem(db, seer.id, "Binder 1");
    await moveItem(db, sol.id, "Box A", 1); // one Sol Ring to a box, one stays in "bulk"
    const boxed = (await rows()).find((r) => r.location === "Box A")!;
    // A deck uses the boxed Sol Ring.
    await db.insert(deckCards).values({ deckId: 1, oracleId: sol.oracleId, board: "main", collectionItemId: boxed.id });

    // The same file: nothing to do, and nothing moves back.
    expect((await previewImport(db, { text: file(2) })).diff).toMatchObject({ added: 0, removed: 0, changed: 0 });
    await importCollection(db, { text: file(2), mode: "update", online: false });
    expect((await rows()).map((r) => [r.location, r.quantity])).toEqual([["bulk", 1], ["Binder 1", 1], ["Box A", 1]]);

    // One more Sol Ring in the file: it goes on a stack no deck uses.
    await importCollection(db, { text: file(3), mode: "update", online: false });
    expect((await rows()).map((r) => [r.location, r.quantity])).toEqual([["bulk", 2], ["Binder 1", 1], ["Box A", 1]]);

    // Down to one: copies come off the unused stack first, so the deck keeps its Sol Ring.
    await importCollection(db, { text: file(1), mode: "update", online: false });
    const after = await rows();
    expect(after.map((r) => [r.location, r.quantity])).toEqual([["Binder 1", 1], ["Box A", 1]]);
    expect(after.find((r) => r.location === "Box A")!.id).toBe(boxed.id);
  });
});
