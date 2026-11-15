import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { collectionItems, deckCards } from "@/db/schema";
import { storeScryfallCards } from "@/lib/cards/store";
import type { ScryfallCard } from "@/lib/scryfall/client";
import { cardAvailability } from "@/lib/collection/availability";
import { collectionTotals, parseFilters, queryCollection } from "@/lib/collection/query";
import { addDeckCard, createDeck, setDeckStatus } from "@/lib/deck/store";
import { tempDb } from "./helpers";

process.env.EDHREC_ENABLED = "false";

let n = 0;
function fake(name: string, o: { type?: string; ci?: string; usd?: string | null; foil?: string | null } = {}): ScryfallCard {
  n += 1;
  const hex = n.toString(16).padStart(12, "0");
  const prices: Record<string, string> = {};
  if (o.usd !== null) prices.usd = o.usd ?? "1.00";
  if (o.foil) prices.usd_foil = o.foil;
  return {
    object: "card",
    id: `00000000-0000-4000-9000-${hex}`,
    oracle_id: `22222222-0000-4000-9000-${hex}`,
    name,
    lang: "en",
    released_at: "2024-01-01",
    layout: "normal",
    mana_cost: "{1}",
    cmc: 1,
    type_line: o.type ?? "Artifact",
    oracle_text: "",
    colors: [...(o.ci ?? "")],
    color_identity: [...(o.ci ?? "")],
    keywords: [],
    legalities: { commander: "legal" },
    games: ["paper"],
    set: "tst",
    set_name: "Test Set",
    set_type: "expansion",
    collector_number: String(n),
    rarity: "rare",
    finishes: ["nonfoil", "foil"],
    edhrec_rank: 100,
    prices,
    image_uris: { small: "s.jpg", normal: "n.jpg" },
  } as unknown as ScryfallCard;
}

const CARDS = [
  fake("Lead Commander", { type: "Legendary Creature — Test", ci: "G" }),
  fake("Other Commander", { type: "Legendary Creature — Test", ci: "G" }),
  fake("Staple Ring", { usd: "2.00", foil: "10.00" }),
  fake("Only Nonfoil Price", { usd: "3.00" }),
  fake("No Price At All", { usd: null }),
  fake("Proxy Bomb", { usd: "50.00" }),
  fake("Forest", { type: "Basic Land — Forest", ci: "G", usd: "0.10" }),
  fake("Spare Card", { usd: "1.00" }),
];
const card = (name: string) => CARDS.find((c) => c.name === name)!;
const id = (name: string) => card(name).oracle_id!;

async function own(db: Db, name: string, quantity = 1, extra: Partial<typeof collectionItems.$inferInsert> = {}) {
  await db.insert(collectionItems).values({
    printingId: card(name).id,
    oracleId: id(name),
    quantity,
    source: "manual",
    addedAt: new Date().toISOString(),
    location: "Binder 1",
    ...extra,
  });
}

let db: Db;
let cleanup: () => void;
beforeEach(async () => {
  ({ db, cleanup } = await tempDb());
  await storeScryfallCards(db, CARDS);
  await own(db, "Lead Commander");
  await own(db, "Staple Ring", 1);
  await own(db, "Staple Ring", 1, { finish: "foil", location: "Box: Red-Green" });
  await own(db, "Only Nonfoil Price", 2, { finish: "foil", location: "" });
  await own(db, "No Price At All", 1);
  await own(db, "Proxy Bomb", 1, { proxy: true, location: "Proxies" });
  await own(db, "Forest", 30, { location: "Box: Lands" });
  await own(db, "Spare Card", 1);
});
afterEach(() => cleanup());

describe("collectionTotals (R1 · R2 · R3)", () => {
  it("counts every copy with proxies, unique cards without basics, and values real copies only", async () => {
    const t = await collectionTotals(db);
    // 1 + 2 + 2 + 1 + 1 + 30 + 1 copies; the proxy is one of them.
    expect(t).toMatchObject({ copies: 38, proxies: 1, unique: 6 });
    // Lead Commander 1.00 + Staple Ring 2.00 + 10.00 (foil) + Only Nonfoil 2 × 3.00 + Forest 30 × 0.10 + Spare 1.00. The proxy isn't valued.
    expect(t.value).toBeCloseTo(23, 5);
    // The two foils with no foil price were priced from the nonfoil price; one card has no price at all.
    expect(t.estimated).toBe(2);
    expect(t.unpriced).toBe(1);
  });

  it("matches queryCollection's copies and value for the same filters", async () => {
    for (const params of [{}, { q: "ring" }, { type: "land" }, { ci: "G", ciMode: "includes" }]) {
      const f = parseFilters(params);
      const [t, q] = await Promise.all([collectionTotals(db, f), queryCollection(db, f)]);
      expect(t.copies).toBe(q.totals.copies);
      expect(t.value ?? 0).toBeCloseTo(q.totals.value ?? 0, 5);
    }
  });

  it("follows the filters, and a basic land on its own counts no unique cards", async () => {
    expect(await collectionTotals(db, parseFilters({ q: "staple" }))).toMatchObject({ copies: 2, unique: 1, estimated: 0, unpriced: 0 });
    expect(await collectionTotals(db, parseFilters({ type: "land" }))).toMatchObject({ copies: 30, unique: 0 });
  });
});

describe("cardAvailability (R4 · R5)", () => {
  it("shows a card nobody uses as all free, with where its copies live", async () => {
    const a = (await cardAvailability(db, [id("Staple Ring")])).get(id("Staple Ring"))!;
    expect(a).toMatchObject({ owned: 2, proxies: 0, inDecks: 0, free: 2, decks: [], wantedBy: [] });
    expect(a.places).toEqual([
      { location: "Binder 1", copies: 1 },
      { location: "Box: Red-Green", copies: 1 },
    ]);
  });

  it("counts copies placed in building decks as in decks, and lists the decks still wanting one", async () => {
    const holder = await createDeck(db, { commanderOracleId: id("Lead Commander"), name: "Holder", status: "building" });
    await addDeckCard(db, holder.id, id("Spare Card"));
    const idea = await createDeck(db, { commanderOracleId: id("Other Commander"), name: "Idea" });
    await addDeckCard(db, idea.id, id("Spare Card"));
    const second = await createDeck(db, { commanderOracleId: id("Other Commander"), name: "Second", status: "building" });
    await addDeckCard(db, second.id, id("Spare Card"));
    await db.update(deckCards).set({ synergy: 0.25 }).where(eq(deckCards.deckId, second.id));

    const a = (await cardAvailability(db, [id("Spare Card")])).get(id("Spare Card"))!;
    expect(a).toMatchObject({ owned: 1, inDecks: 1, free: 0 });
    expect(a.decks).toEqual([{ id: holder.id, name: "Holder" }]);
    // The idea deck only wants it (D4); the second building deck has an open slot because the one copy is taken.
    expect(a.wantedBy).toEqual([
      { id: idea.id, name: "Idea", status: "idea", synergy: null },
      { id: second.id, name: "Second", status: "building", synergy: 0.25 },
    ]);
  });

  it("gives copies back when a deck is retired, and never says a basic land is wanted", async () => {
    const d = await createDeck(db, { commanderOracleId: id("Lead Commander"), name: "Lands", status: "building" });
    await addDeckCard(db, d.id, id("Spare Card"));
    await addDeckCard(db, d.id, id("Forest"));
    expect((await cardAvailability(db, [id("Spare Card")])).get(id("Spare Card"))).toMatchObject({ inDecks: 1, free: 0 });
    await setDeckStatus(db, d.id, "retired");
    const m = await cardAvailability(db, [id("Spare Card"), id("Forest")]);
    expect(m.get(id("Spare Card"))).toMatchObject({ inDecks: 0, free: 1, decks: [], wantedBy: [] });
    expect(m.get(id("Forest"))).toMatchObject({ owned: 30, wantedBy: [] });
  });

  it("marks proxies, copies that need a home, and the decks a card leads", async () => {
    await createDeck(db, { commanderOracleId: id("Lead Commander"), name: "Led", status: "building" });
    const m = await cardAvailability(db, [id("Proxy Bomb"), id("Only Nonfoil Price"), id("Lead Commander"), id("Other Commander")]);
    expect(m.get(id("Proxy Bomb"))).toMatchObject({ owned: 1, proxies: 1, free: 1 });
    expect(m.get(id("Only Nonfoil Price"))!.places).toEqual([{ location: "", copies: 2 }]);
    expect(m.get(id("Lead Commander"))!.commanderOf).toMatchObject([{ name: "Led", status: "building" }]);
    // Cards you don't own aren't in the map.
    expect(m.has(id("Other Commander"))).toBe(false);
  });
});
