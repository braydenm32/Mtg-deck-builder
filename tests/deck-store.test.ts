import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { collectionItems, deckCards } from "@/db/schema";
import { storeScryfallCards } from "@/lib/cards/store";
import type { ScryfallCard } from "@/lib/scryfall/client";
import { moveCardToDeck, sharedCards } from "@/lib/deck/allocate";
import { addDeckCard, createDeck, getDeck, listDecks, rebuildDeck, removeDeckCard, restoreDeckCard, setDeckStatus } from "@/lib/deck/store";
import { suggestCommanders } from "@/lib/deck/suggest";
import { tempDb } from "./helpers";

process.env.EDHREC_ENABLED = "false";

let n = 0;
function fake(name: string, o: { type?: string; text?: string; ci?: string; cost?: string; cmc?: number; rank?: number; price?: number } = {}): ScryfallCard {
  n += 1;
  const hex = n.toString(16).padStart(12, "0");
  return {
    object: "card",
    id: `00000000-0000-4000-8000-${hex}`,
    oracle_id: `11111111-0000-4000-8000-${hex}`,
    name,
    lang: "en",
    released_at: "2024-01-01",
    layout: "normal",
    mana_cost: o.cost ?? "{1}",
    cmc: o.cmc ?? 2,
    type_line: o.type ?? "Creature — Test",
    oracle_text: o.text ?? "",
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
    edhrec_rank: o.rank ?? 5000,
    prices: { usd: o.price !== undefined ? String(o.price) : "0.50" },
    image_uris: { small: "s.jpg", normal: "n.jpg" },
  } as unknown as ScryfallCard;
}

const CARDS = [
  fake("Bloodthirsty Lord", { type: "Legendary Creature — Vampire", text: "Whenever another creature you control dies, each opponent loses 1 life.", ci: "B", cost: "{2}{B}{B}" }),
  fake("Goblin Boss", { type: "Legendary Creature — Goblin", text: "Haste", ci: "R", cost: "{2}{R}" }),
  fake("Grim Altar", { type: "Artifact", text: "Sacrifice a creature: Add {B}.", ci: "B", cost: "{2}" }),
  fake("Blood Pact", { type: "Enchantment", text: "Whenever a creature you control dies, draw a card.", ci: "B", cost: "{1}{B}" }),
  fake("Doom Blade Test", { type: "Instant", text: "Destroy target nonblack creature.", ci: "B", cost: "{1}{B}" }),
  fake("Mind Stone Test", { type: "Artifact", text: "{T}: Add {C}.", ci: "", cost: "{2}", rank: 30 }),
  fake("Dark Ritual Test", { type: "Instant", text: "Add {B}{B}{B}.", ci: "B", cost: "{B}" }),
  fake("Shock Test", { type: "Instant", text: "Shock Test deals 2 damage to any target.", ci: "R", cost: "{R}" }),
  fake("Big Staple", { type: "Sorcery", text: "Destroy all creatures.", ci: "B", cost: "{2}{B}{B}", rank: 10, price: 12 }),
  fake("Swamp", { type: "Basic Land — Swamp", text: "({T}: Add {B}.)", ci: "B", cost: "" }),
  fake("Mountain", { type: "Basic Land — Mountain", text: "({T}: Add {R}.)", ci: "R", cost: "" }),
];
const id = (name: string) => CARDS.find((c) => c.name === name)!.oracle_id!;
const printing = (name: string) => CARDS.find((c) => c.name === name)!.id;

async function own(db: Db, name: string, quantity = 1, extra: Partial<typeof collectionItems.$inferInsert> = {}) {
  await db.insert(collectionItems).values({
    printingId: printing(name),
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
  for (const name of ["Bloodthirsty Lord", "Goblin Boss", "Grim Altar", "Blood Pact", "Doom Blade Test", "Mind Stone Test", "Dark Ritual Test", "Shock Test"]) await own(db, name);
});
afterEach(() => cleanup());

describe("deck store", () => {
  it("builds a 100-card deck from owned cards, places copies, and fills with basics", async () => {
    const deck = await createDeck(db, { commanderOracleId: id("Bloodthirsty Lord"), theme: "aristocrats" });
    expect(deck.name).toBe("Bloodthirsty Lord Aristocrats");
    expect(deck.colorIdentity).toBe("B");
    await rebuildDeck(db, deck.id);
    const v = (await getDeck(db, deck.id))!;
    const main = v.cards.filter((c) => c.board === "main");
    expect(v.progress.total).toBe(100);
    // Off-colour cards never get in.
    expect(main.some((c) => c.name === "Shock Test" || c.name === "Goblin Boss")).toBe(false);
    const altar = main.find((c) => c.name === "Grim Altar")!;
    expect(altar.state).toBe("placed");
    expect(altar.location).toBe("Binder 1");
    expect(main.find((c) => c.name === "Swamp")!.quantity).toBeGreaterThan(30);
    // The unowned staple is suggested to buy (a board wipe gap) and costs money to finish.
    const staple = main.find((c) => c.name === "Big Staple");
    expect(staple?.state).toBe("not-owned");
    expect(v.costToFinish).toBe(12);
  });

  it("never puts the same copy in two active decks, and idea decks claim nothing", async () => {
    const a = await createDeck(db, { commanderOracleId: id("Bloodthirsty Lord") });
    await rebuildDeck(db, a.id);
    const b = await createDeck(db, { commanderOracleId: id("Bloodthirsty Lord"), name: "Second" });
    await rebuildDeck(db, b.id);
    const vb = (await getDeck(db, b.id))!;
    // B can't have Grim Altar in its main deck (A holds the only copy) - it's wanted instead.
    expect(vb.cards.find((c) => c.name === "Grim Altar" && c.board === "main")).toBeUndefined();
    expect(vb.cards.find((c) => c.name === "Grim Altar")?.board).toBe("wanted");

    // Make A an idea: its copies are released, and B's rebuild picks Grim Altar up.
    await setDeckStatus(db, a.id, "idea");
    await rebuildDeck(db, b.id);
    const vb2 = (await getDeck(db, b.id))!;
    expect(vb2.cards.find((c) => c.name === "Grim Altar")?.state).toBe("placed");
    const va = (await getDeck(db, a.id))!;
    expect(va.cards.find((c) => c.name === "Grim Altar")?.state).toBe("other-deck");
  });

  it("keeps locked and hand-added cards when rebuilding; remove can be undone", async () => {
    const d = await createDeck(db, { commanderOracleId: id("Bloodthirsty Lord") });
    await rebuildDeck(db, d.id, { suggestUnowned: false });
    await addDeckCard(db, d.id, id("Big Staple"), { acquire: "proxy" });
    await rebuildDeck(db, d.id, { suggestUnowned: false });
    let v = (await getDeck(db, d.id))!;
    const staple = v.cards.find((c) => c.name === "Big Staple")!;
    expect(staple.locked).toBe(true);
    expect(staple.acquire).toBe("proxy");
    expect(v.progress.total).toBe(100);

    const removed = (await removeDeckCard(db, d.id, staple.id))!;
    v = (await getDeck(db, d.id))!;
    expect(v.cards.find((c) => c.name === "Big Staple")).toBeUndefined();
    await restoreDeckCard(db, removed);
    v = (await getDeck(db, d.id))!;
    expect(v.cards.find((c) => c.name === "Big Staple")?.id).toBe(staple.id);
  });

  it("buy suggestions turn into owned cards once you add a copy", async () => {
    const d = await createDeck(db, { commanderOracleId: id("Bloodthirsty Lord") });
    await rebuildDeck(db, d.id);
    expect((await getDeck(db, d.id))!.cards.find((c) => c.name === "Big Staple")?.acquire).toBe("buy");
    await own(db, "Big Staple");
    await addDeckCard(db, d.id, id("Big Staple")); // any change re-places copies
    const row = (await getDeck(db, d.id))!.cards.find((c) => c.name === "Big Staple")!;
    expect(row.state).toBe("placed");
    expect(row.acquire).toBeNull();
  });

  it("lists shared cards and moves one to the recommended deck", async () => {
    const a = await createDeck(db, { commanderOracleId: id("Bloodthirsty Lord"), name: "A" });
    await rebuildDeck(db, a.id);
    const b = await createDeck(db, { commanderOracleId: id("Bloodthirsty Lord"), name: "B" });
    await rebuildDeck(db, b.id);
    // Give B a stronger synergy for Grim Altar.
    await db.update(deckCards).set({ synergy: 0.4 }).where(eq(deckCards.oracleId, id("Grim Altar")));
    await db.update(deckCards).set({ synergy: 0.05 }).where(eq(deckCards.deckId, a.id));
    const shared = await sharedCards(db);
    const altar = shared.find((s) => s.name === "Grim Altar")!;
    expect(altar.copies).toBe(1);
    expect(altar.decks.find((d) => d.recommended)!.deckName).toBe("B");
    expect(altar.getAnother).toBe(true); // $0.50

    await moveCardToDeck(db, id("Grim Altar"), b.id);
    const vb = (await getDeck(db, b.id))!;
    const va = (await getDeck(db, a.id))!;
    expect(vb.cards.find((c) => c.name === "Grim Altar")).toMatchObject({ board: "main", state: "placed", locked: true });
    expect(va.cards.find((c) => c.name === "Grim Altar" && c.board === "main")).toBeUndefined();
    expect(va.progress.total).toBe(100);
    expect(vb.progress.total).toBe(100);
  });

  it("suggests owned commanders for a theme", async () => {
    const { owned } = await suggestCommanders(db, "aristocrats");
    expect(owned[0].name).toBe("Bloodthirsty Lord");
    expect(owned[0].fitting).toBeGreaterThan(0);
  });

  it("lists decks with progress", async () => {
    const d = await createDeck(db, { commanderOracleId: id("Goblin Boss") });
    await rebuildDeck(db, d.id, { suggestUnowned: false });
    const list = await listDecks(db);
    expect(list[0].commanders[0].name).toBe("Goblin Boss");
    expect(list[0].progress.placed).toBe(list[0].progress.total);
  });
});
