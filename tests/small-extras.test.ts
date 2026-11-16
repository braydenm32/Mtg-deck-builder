import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import { storeScryfallCards } from "@/lib/cards/store";
import { importCollection } from "@/lib/collection/import";
import { groupLabel, parseFilters, queryCollection } from "@/lib/collection/query";
import { newestPrices, printingSavings } from "@/lib/collection/savings";
import { addDeckCard, createDeck, getDeck, updateDeckCard } from "@/lib/deck/store";
import { colourCurveOf } from "@/lib/deck/stats";
import type { ScryfallCard } from "@/lib/scryfall/client";
import { entries } from "./deck-fixtures";
import { seededDb, tempDb } from "./helpers";

describe("curve by colour", () => {
  it("counts each nonland card under its own colours, multicoloured together", () => {
    const rows = colourCurveOf(entries({ "Sol Ring": 1, Cultivate: 1, "Kodama's Reach": 1, Counterspell: 1, "Overgrown Tomb": 1, "Doubling Season": 1, "Atraxa, Praetors' Voice": 1 }));
    const by = Object.fromEntries(rows.map((r) => [r.key, r]));
    expect(by.G.counts[3]).toBe(2);
    expect(by.U.counts[2]).toBe(1);
    expect(by.C.counts[1]).toBe(1);
    expect(by.M.total).toBe(1);
    // Lands are left out, and empty colours aren't listed.
    expect(rows.reduce((n, r) => n + r.total, 0)).toBe(6);
    expect(rows.map((r) => r.key)).toEqual(["U", "G", "M", "C"]);
  });

  it("falls back to the cost's symbols when colours aren't known", () => {
    const hybrid = { name: "Hybrid", cmc: 2, typeLine: "Creature", oracleText: "", colorIdentity: "WU", manaCost: "{W/U}{W/U}" };
    const mono = { name: "Mono", cmc: 1, typeLine: "Instant", oracleText: "", colorIdentity: "R", manaCost: "{R}" };
    const rows = colourCurveOf([
      { card: hybrid, quantity: 1, board: "main" },
      { card: mono, quantity: 2, board: "main" },
    ]);
    expect(rows.map((r) => [r.key, r.total])).toEqual([
      ["R", 2],
      ["M", 1],
    ]);
  });
});

describe("cheapest-printing savings", () => {
  it("adds up what the cheapest printings save over the newest, per copy", () => {
    expect(
      printingSavings([
        { copies: 2, cheapestUsd: 1, newestUsd: 3.5 },
        { copies: 1, cheapestUsd: 4, newestUsd: 4 },
        { copies: 1, cheapestUsd: null, newestUsd: 9 },
        { copies: 1, cheapestUsd: 2, newestUsd: undefined },
      ]),
    ).toEqual({ usd: 5, cards: 1 });
  });
});

let n = 0;
function printing(name: string, oracle: string, set: string, released: string, usd: string | null): ScryfallCard {
  n += 1;
  return {
    object: "card",
    id: `80000000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`,
    oracle_id: oracle,
    name,
    lang: "en",
    released_at: released,
    layout: "normal",
    mana_cost: "{1}",
    cmc: 1,
    type_line: "Artifact",
    oracle_text: "",
    colors: [],
    color_identity: [],
    keywords: [],
    legalities: { commander: "legal" },
    games: ["paper"],
    set,
    set_name: `Set ${set}`,
    set_type: "expansion",
    collector_number: String(n),
    rarity: "rare",
    finishes: ["nonfoil"],
    prices: { usd },
    image_uris: { small: `${set}.jpg`, normal: `${set}-n.jpg` },
  } as unknown as ScryfallCard;
}

describe("printings: newest prices and a deck card's picture", () => {
  const ORACLE = "81111111-0000-4000-8000-000000000001";
  const LEADER = "81111111-0000-4000-8000-000000000002";
  const old = printing("Old Relic", ORACLE, "aaa", "2010-01-01", "1.00");
  const newer = printing("Old Relic", ORACLE, "bbb", "2024-01-01", "6.00");
  const newest = printing("Old Relic", ORACLE, "ccc", "2025-01-01", null);
  const leader = { ...printing("Relic Leader", LEADER, "ldr", "2024-01-01", "1.00"), type_line: "Legendary Creature — Golem" } as ScryfallCard;
  let db: Db;
  let cleanup: () => void;
  beforeAll(async () => {
    ({ db, cleanup } = await tempDb());
    await storeScryfallCards(db, [old, newer, newest, leader]);
  });
  afterAll(() => cleanup());

  it("takes the newest printing that has a price", async () => {
    expect((await newestPrices(db, [ORACLE])).get(ORACLE)).toBe(6);
  });

  it("shows the picture you choose, only from this card's printings, and goes back", async () => {
    const deck = await createDeck(db, { commanderOracleId: LEADER, status: "idea" });
    await addDeckCard(db, deck.id, ORACLE);
    const row = () => getDeck(db, deck.id).then((v) => v.cards.find((c) => c.oracleId === ORACLE)!);
    const usual = (await row()).imageSmall;
    await updateDeckCard(db, deck.id, (await row()).id, { printingId: old.id });
    expect((await row()).imageSmall).toBe("aaa.jpg");
    expect((await row()).printingId).toBe(old.id);
    await updateDeckCard(db, deck.id, (await row()).id, { printingId: leader.id });
    expect((await row()).printingId).toBe(old.id);
    await updateDeckCard(db, deck.id, (await row()).id, { printingId: null });
    expect((await row()).imageSmall).toBe(usual);
  });
});

describe("grouping the collection", () => {
  let db: Db;
  let cleanup: () => void;
  beforeAll(async () => {
    ({ db, cleanup } = await seededDb());
    await importCollection(db, { text: "1 Atraxa, Praetors' Voice\n2 Sakura-Tribe Elder\n1 Lightning Bolt (M10) 146\n1 Korvold, Fae-Cursed King\n1 Sol Ring", online: false });
  });
  afterAll(() => cleanup());

  const groups = async (group: string) => (await queryCollection(db, parseFilters({ group }))).cards.map((c) => [c.group, c.name]);

  it("sorts cards into sections in a sensible order", async () => {
    expect(await groups("colour")).toEqual([
      ["Mono-red (R)", "Lightning Bolt"],
      ["Mono-green (G)", "Sakura-Tribe Elder"],
      ["Jund (BRG)", "Korvold, Fae-Cursed King"],
      ["Four-colour (WUBG)", "Atraxa, Praetors' Voice"],
      ["Colourless", "Sol Ring"],
    ]);
    expect((await groups("type")).map((g) => g[0])).toEqual(["Creatures", "Creatures", "Creatures", "Instants", "Artifacts"]);
    expect(parseFilters({ group: "nonsense" }).group).toBeUndefined();
  });

  it("labels group keys", () => {
    expect(groupLabel("colour", "2|0|BG")).toBe("Golgari (BG)");
    expect(groupLabel("set", "2024-08-02|Bloomburrow")).toBe("Bloomburrow");
    expect(groupLabel("rarity", "1|Mythic")).toBe("Mythic");
  });
});
