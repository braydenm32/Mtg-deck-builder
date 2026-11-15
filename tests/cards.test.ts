import fs from "node:fs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { cards, printings } from "@/db/schema";
import { matchIdentities } from "@/lib/cards/match";
import { printingsByName, printingsBySetNumber, searchCardNames } from "@/lib/cards/lookup";
import { FIXTURE_JA, seededDb } from "./helpers";

let db: Db;
let cleanup: () => void;
beforeAll(async () => ({ db, cleanup } = await seededDb()));
afterAll(() => cleanup());

const SOL_RING_C21 = "4cbc6901-6a4a-4d0a-83ea-7eefa3b35021";

describe("bulk sync", () => {
  it("loads cards and printings", async () => {
    expect((await db.select().from(cards)).length).toBe(10);
    expect((await db.select().from(printings)).length).toBe(10);
  });

  it("derives commander fields", async () => {
    const [atraxa] = await db.select().from(cards).where(eq(cards.name, "Atraxa, Praetors' Voice"));
    expect(atraxa.colorIdentity).toBe("WUBG");
    expect(atraxa.canBeCommander).toBe(true);
    expect(atraxa.legalCommander).toBe("legal");
    const [grist] = await db.select().from(cards).where(eq(cards.normName, "grist the hunger tide"));
    expect(grist.canBeCommander).toBe(true); // a creature everywhere but the battlefield
    const [sol] = await db.select().from(cards).where(eq(cards.name, "Sol Ring"));
    expect(sol.canBeCommander).toBe(false);
    expect(sol.colorIdentity).toBe("");
  });

  it("keeps faces for double-faced cards", async () => {
    const [fable] = await db.select().from(cards).where(eq(cards.normFrontName, "fable of the mirror breaker"));
    expect(fable.cardFaces?.length).toBe(2);
    expect(fable.imageNormal).toMatch(/^https:\/\/cards\.scryfall\.io\//);
  });

  it("is idempotent", async () => {
    const { syncCards } = await import("@/lib/cards/sync");
    const { FIXTURE } = await import("./helpers");
    await syncCards(db, { files: { oracle_cards: FIXTURE, default_cards: FIXTURE } });
    expect((await db.select().from(printings)).length).toBe(10);
  });
});

describe("lookup", () => {
  it("by set and collector number", async () => {
    const list = await printingsBySetNumber(db, "C21", "0263");
    expect(list.map((p) => p.id)).toEqual([SOL_RING_C21]);
  });
  it("by name", async () => {
    expect((await printingsByName(db, "sol ring")).length).toBe(1);
    expect((await printingsByName(db, "Fable of the Mirror-Breaker")).length).toBe(1);
  });
  it("name search", async () => {
    const names = (await searchCardNames(db, "kor")).map((c) => c.name);
    expect(names).toContain("Korvold, Fae-Cursed King");
  });
});

describe("matchIdentities (offline)", () => {
  it("matches by every route", async () => {
    const res = await matchIdentities(
      db,
      [
        { scryfallId: SOL_RING_C21.toUpperCase() },
        { setCode: "c21", collectorNumber: "263" },
        { name: "Jotun Grunt" },
        { name: "Fire/Ice" },
        { name: "Fable of the Mirror-Breaker", setCode: "neo" },
        { name: "Not A Real Card" },
        {},
      ],
      { online: false },
    );
    expect(res.map((r) => (r.ok ? r.via : "miss"))).toEqual([
      "scryfall-id",
      "set-number",
      "name",
      "name",
      "name-set",
      "miss",
      "miss",
    ]);
    expect(res[5].ok ? "" : res[5].reason).toMatch(/Not A Real Card/);
  });
});

describe("matchIdentities (online fallback)", () => {
  it("fetches a printing missing from bulk data and stores it", async () => {
    const ja = JSON.parse(fs.readFileSync(FIXTURE_JA, "utf8"));
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ object: "list", data: [ja], not_found: [] }), { status: 200 }),
    );
    const [r] = await matchIdentities(db, [{ scryfallId: ja.id, lang: "ja" }]);
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.scryfall.com/cards/collection");
    expect((init.headers as Record<string, string>)["User-Agent"]).toMatch(/mtg-deck-builder/);
    expect(r.ok && r.printing.lang).toBe("ja");
    // Stored, so the next lookup is local.
    const [again] = await matchIdentities(db, [{ scryfallId: ja.id }]);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(again.ok).toBe(true);
    fetchMock.mockRestore();
  });
});
