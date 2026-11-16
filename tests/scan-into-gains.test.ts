import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { wants } from "@/db/schema";
import { storeScryfallCards } from "@/lib/cards/store";
import { collectionGains, conditionValue } from "@/lib/collection/gains";
import { addPrinting, setPurchasePrice } from "@/lib/collection/service";
import { createDeck, getDeck } from "@/lib/deck/store";
import { scanIntoDeck, scanIntoWants, undoScanIntoDeck, undoScanIntoWants } from "@/lib/scan-into";
import type { ScryfallCard } from "@/lib/scryfall/client";
import { removedText, settingsSummary } from "@/components/scanner/text";
import { scanTarget } from "@/components/scanner/types";
import { tempDb } from "./helpers";

let n = 0;
function fake(name: string, usd: string, type = "Instant", ci = ""): ScryfallCard {
  n += 1;
  const hex = n.toString(16).padStart(12, "0");
  return {
    object: "card",
    id: `70000000-0000-4000-8000-${hex}`,
    oracle_id: `71111111-0000-4000-8000-${hex}`,
    name,
    lang: "en",
    released_at: "2024-01-01",
    layout: "normal",
    mana_cost: "{1}",
    cmc: 1,
    type_line: type,
    oracle_text: "",
    colors: [...ci],
    color_identity: [...ci],
    keywords: [],
    legalities: { commander: "legal" },
    games: ["paper"],
    set: "tst",
    set_name: "Test Set",
    set_type: "expansion",
    collector_number: String(n),
    rarity: "rare",
    finishes: ["nonfoil"],
    prices: { usd },
    image_uris: { small: "s.jpg", normal: "n.jpg" },
  } as unknown as ScryfallCard;
}

const LEADER = fake("Scan Leader", "1.00", "Legendary Creature — Human", "W");
const RING = fake("Ring", "10.00", "Artifact");
const ORB = fake("Orb", "4.00", "Artifact");

let db: Db;
let cleanup: () => void;
let deckId: number;
beforeEach(async () => {
  ({ db, cleanup } = await tempDb());
  await storeScryfallCards(db, [LEADER, RING, ORB]);
  deckId = (await createDeck(db, { commanderOracleId: LEADER.oracle_id!, name: "Table deck", status: "building" })).id;
});
afterEach(() => cleanup());

describe("scan into a deck or the want list", () => {
  it("adds a scanned card to the deck, and Undo takes the row out", async () => {
    await addPrinting(db, { scryfallId: RING.id }, { source: "scanner" });
    const r = await scanIntoDeck(db, deckId, RING.oracle_id!);
    expect(r).toMatchObject({ deck: "Table deck" });
    let v = (await getDeck(db, deckId))!;
    const row = v.cards.find((c) => c.name === "Ring")!;
    expect(row).toMatchObject({ board: "main", state: "placed" });
    // A second scan of a card the deck already has makes no new row.
    expect((await scanIntoDeck(db, deckId, RING.oracle_id!))!.cardId).toBeNull();
    await undoScanIntoDeck(db, deckId, r!.cardId!);
    v = (await getDeck(db, deckId))!;
    expect(v.cards.some((c) => c.name === "Ring")).toBe(false);
    expect(await scanIntoDeck(db, 9999, RING.oracle_id!)).toBeUndefined();
  });

  it("puts a scanned card on the want list, and Undo puts the count back", async () => {
    const first = await scanIntoWants(db, ORB.oracle_id!);
    expect(first).toEqual({ previous: 0, quantity: 1 });
    const second = await scanIntoWants(db, ORB.oracle_id!);
    expect(second).toEqual({ previous: 1, quantity: 2 });
    await undoScanIntoWants(db, ORB.oracle_id!, second.previous);
    expect((await db.select().from(wants).where(eq(wants.oracleId, ORB.oracle_id!)))[0].quantity).toBe(1);
    await undoScanIntoWants(db, ORB.oracle_id!, first.previous);
    expect(await db.select().from(wants).where(eq(wants.oracleId, ORB.oracle_id!))).toEqual([]);
  });

  it("reads the setting, and says where cards go", () => {
    const decks = [{ id: 3, name: "Table deck" }];
    expect(scanTarget("deck:3", decks)).toEqual({ kind: "deck", deckId: 3, name: "Table deck" });
    expect(scanTarget("deck:4", decks)).toEqual({ kind: "collection" });
    expect(scanTarget("wants", decks)).toEqual({ kind: "wants" });
    expect(settingsSummary({ condition: "NM", location: "Box" }, { kind: "deck", deckId: 3, name: "Table deck" })).toBe("NM · Box · into Table deck");
    expect(settingsSummary({ condition: "NM", location: "" }, { kind: "wants" })).toBe("To the want list");
    expect(removedText("Ring", { kind: "wants" })).toContain("want list");
  });
});

describe("gain or loss, and condition", () => {
  it("sets what you paid against what it's worth now", async () => {
    const ring = await addPrinting(db, { scryfallId: RING.id, quantity: 2 }, { source: "manual" });
    const orb = await addPrinting(db, { scryfallId: ORB.id }, { source: "manual" });
    expect((await collectionGains(db)).copies).toBe(0);
    await setPurchasePrice(db, ring.itemId, 6);
    await setPurchasePrice(db, orb.itemId, 5);
    const g = await collectionGains(db);
    expect(g).toMatchObject({ copies: 3, paid: 17, worth: 24 });
    expect(g.up[0]).toMatchObject({ name: "Ring", change: 8 });
    expect(g.down[0]).toMatchObject({ name: "Orb", change: -1 });
  });

  it("counts played copies at a share of the near-mint price", async () => {
    await addPrinting(db, { scryfallId: RING.id }, { source: "manual" });
    await addPrinting(db, { scryfallId: ORB.id, condition: "HP" }, { source: "manual" });
    expect(await conditionValue(db)).toEqual({ adjusted: 12, played: 1, less: 2 });
  });
});
