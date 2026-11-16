import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { collectionItems, deckCards } from "@/db/schema";
import { storeScryfallCards } from "@/lib/cards/store";
import type { ScryfallCard } from "@/lib/scryfall/client";
import { moveCardToDeck, sharedCards } from "@/lib/deck/allocate";
import { addDeckCard, copyDeck, updateDeckCard, importDecklist, createDeck, targetBracketOf, updateDeck, getDeck, listDecks, rebuildDeck, removeDeckCard, restoreDeckCard, setDeckStatus } from "@/lib/deck/store";
import { exportDeck } from "@/lib/deck/export";
import { deckTokens } from "@/lib/deck/tokens";
import { addWant, removeWant, wantList } from "@/lib/collection/wants";
import { moveItem } from "@/lib/collection/service";
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
  fake("Rakdos Test Lord", { type: "Legendary Creature — Devil", text: "Whenever a creature you control dies, this deals 1 damage to each opponent.", ci: "BR", cost: "{B}{R}", rank: 900 }),
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
    const deck = await createDeck(db, { commanderOracleId: id("Bloodthirsty Lord"), theme: "aristocrats", status: "building" });
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
    const a = await createDeck(db, { commanderOracleId: id("Bloodthirsty Lord"), status: "building" });
    await rebuildDeck(db, a.id);
    const b = await createDeck(db, { commanderOracleId: id("Bloodthirsty Lord"), name: "Second", status: "building" });
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
    const d = await createDeck(db, { commanderOracleId: id("Bloodthirsty Lord"), status: "building" });
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
    const d = await createDeck(db, { commanderOracleId: id("Bloodthirsty Lord"), status: "building" });
    await rebuildDeck(db, d.id);
    expect((await getDeck(db, d.id))!.cards.find((c) => c.name === "Big Staple")?.acquire).toBe("buy");
    await own(db, "Big Staple");
    await addDeckCard(db, d.id, id("Big Staple")); // any change re-places copies
    const row = (await getDeck(db, d.id))!.cards.find((c) => c.name === "Big Staple")!;
    expect(row.state).toBe("placed");
    expect(row.acquire).toBeNull();
  });

  it("starts new decks as ideas that hold nothing but still show what you own", async () => {
    const d = await createDeck(db, { commanderOracleId: id("Bloodthirsty Lord") });
    expect(d.status).toBe("idea");
    await rebuildDeck(db, d.id);
    const v = (await getDeck(db, d.id))!;
    expect(v.claiming).toBe(false);
    expect(v.cards.some((c) => c.state === "placed" && !c.basic)).toBe(false);
    expect(v.cards.find((c) => c.name === "Grim Altar")?.state).toBe("free");
    expect(v.progress.placed).toBeGreaterThan(1);
  });

  it("targets Bracket 3 unless the deck says otherwise, and merges setting changes", async () => {
    const d = await createDeck(db, { commanderOracleId: id("Bloodthirsty Lord"), settings: { suggestUnowned: false } });
    expect(targetBracketOf(d.settings)).toBe(3);
    await updateDeck(db, d.id, { settings: { targetBracket: 4 } });
    const v = (await getDeck(db, d.id))!;
    expect(v.deck.settings).toEqual({ suggestUnowned: false, targetBracket: 4 });
  });

  it("a deck holds its commander's copy, so a second deck can't use it", async () => {
    const a = await createDeck(db, { commanderOracleId: id("Bloodthirsty Lord"), name: "A", status: "building" });
    await rebuildDeck(db, a.id);
    const va = (await getDeck(db, a.id))!;
    expect(va.commanderSlots).toHaveLength(1);
    expect(va.commanderSlots[0].state).toBe("placed");
    expect(va.commanderSlots[0].location).toBe("Binder 1");
    expect(va.cards.some((c) => c.board === ("commander" as string))).toBe(false);

    const b = await createDeck(db, { commanderOracleId: id("Bloodthirsty Lord"), name: "B", status: "building" });
    await rebuildDeck(db, b.id);
    let vb = (await getDeck(db, b.id))!;
    expect(vb.commanderSlots[0].state).toBe("other-deck");
    expect(vb.commanderSlots[0].inDecks.map((d) => d.name)).toEqual(["A"]);
    expect(vb.progress.placed).toBeLessThan(vb.progress.total);
    // The commander isn't a shared-card decision: its copy stays with A.
    expect((await sharedCards(db)).some((s) => s.name === "Bloodthirsty Lord")).toBe(false);

    // A becomes an idea: the copy is free and B's commander takes it.
    await setDeckStatus(db, a.id, "idea");
    await setDeckStatus(db, b.id, "building");
    vb = (await getDeck(db, b.id))!;
    expect(vb.commanderSlots[0].state).toBe("placed");
  });

  it("moves copies to another location without taking them out of decks", async () => {
    const d = await createDeck(db, { commanderOracleId: id("Bloodthirsty Lord"), status: "building" });
    await rebuildDeck(db, d.id);
    const altar = () => getDeck(db, d.id).then((v) => v!.cards.find((c) => c.name === "Grim Altar")!);
    const [stack] = await db.select().from(collectionItems).where(eq(collectionItems.oracleId, id("Grim Altar")));
    expect((await altar()).location).toBe("Binder 1");

    // The whole stack: same row, new place; the deck follows.
    expect(await moveItem(db, stack.id, "Box 2")).toBe(stack.id);
    expect((await altar()).location).toBe("Box 2");

    // Part of a stack: a new stack for the moved copies; the deck keeps its copy where it is.
    await db.update(collectionItems).set({ quantity: 3 }).where(eq(collectionItems.id, stack.id));
    const split = (await moveItem(db, stack.id, "Box 3", 2))!;
    expect(split).not.toBe(stack.id);
    let rows = await db.select().from(collectionItems).where(eq(collectionItems.oracleId, id("Grim Altar")));
    expect(rows.map((r) => [r.location, r.quantity]).sort()).toEqual([["Box 2", 1], ["Box 3", 2]]);
    expect((await altar()).location).toBe("Box 2");

    // Into a stack that's already there: they merge, and the deck's copy moves with them.
    expect(await moveItem(db, stack.id, "Box 3")).toBe(split);
    rows = await db.select().from(collectionItems).where(eq(collectionItems.oracleId, id("Grim Altar")));
    expect(rows.map((r) => [r.location, r.quantity])).toEqual([["Box 3", 3]]);
    const a = await altar();
    expect(a.state).toBe("placed");
    expect(a.location).toBe("Box 3");
  });

  it("counts proxies as owned, but places a real copy first", async () => {
    await own(db, "Big Staple", 1, { proxy: true, location: "Proxies" });
    const d = await createDeck(db, { commanderOracleId: id("Bloodthirsty Lord"), status: "building" });
    await rebuildDeck(db, d.id);
    let row = (await getDeck(db, d.id))!.cards.find((c) => c.name === "Big Staple")!;
    expect(row.state).toBe("placed");
    expect(row.placedProxy).toBe(true);
    expect(row.acquire).toBeNull();
    await own(db, "Big Staple", 1, { location: "Binder 2" });
    await addDeckCard(db, d.id, id("Big Staple")); // re-places copies
    row = (await getDeck(db, d.id))!.cards.find((c) => c.name === "Big Staple")!;
    expect(row.placedProxy).toBe(false);
    expect(row.location).toBe("Binder 2");
  });

  it("lists shared cards and moves one to the recommended deck", async () => {
    const a = await createDeck(db, { commanderOracleId: id("Bloodthirsty Lord"), name: "A", status: "building" });
    await rebuildDeck(db, a.id);
    const b = await createDeck(db, { commanderOracleId: id("Bloodthirsty Lord"), name: "B", status: "building" });
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

  it("counts a card given against the pick as decided", async () => {
    const a = await createDeck(db, { commanderOracleId: id("Bloodthirsty Lord"), name: "A", status: "building" });
    await rebuildDeck(db, a.id);
    const b = await createDeck(db, { commanderOracleId: id("Bloodthirsty Lord"), name: "B", status: "building" });
    await rebuildDeck(db, b.id);
    await moveCardToDeck(db, id("Grim Altar"), a.id);
    // B still wants it and fits it better, but you gave the copy to A.
    await db.delete(deckCards).where(and(eq(deckCards.oracleId, id("Grim Altar")), eq(deckCards.deckId, b.id)));
    await db.insert(deckCards).values({ deckId: b.id, oracleId: id("Grim Altar"), board: "wanted", synergy: 0.4, addedBy: "builder" });
    await db.update(deckCards).set({ synergy: 0.05 }).where(eq(deckCards.deckId, a.id));
    const altar = (await sharedCards(db)).find((s) => s.name === "Grim Altar")!;
    expect(altar.decks.find((d) => d.recommended)!.deckName).toBe("B");
    expect(altar.decks.find((d) => d.holds)!.deckName).toBe("A");
    expect(altar.settled).toBe(true);
  });

  it("suggests owned commanders for a theme", async () => {
    const { owned } = await suggestCommanders(db, "aristocrats");
    expect(owned[0].name).toBe("Bloodthirsty Lord");
    expect(owned[0].fitting).toBeGreaterThan(0);
  });

  it("suggests commanders for a creature type, with the card's text for its preview", async () => {
    const { owned } = await suggestCommanders(db, "goblins");
    expect(owned.map((c) => c.name)).toEqual(["Goblin Boss"]);
    expect(owned[0]).toMatchObject({ typeLine: "Legendary Creature — Goblin", oracleText: "Haste", manaCost: "{2}{R}" });
    expect((await suggestCommanders(db, "vampires")).owned.map((c) => c.name)).toEqual(["Bloodthirsty Lord"]);
  });

  it("suggests commanders in exactly the colours you pick, with or without a theme", async () => {
    const red = await suggestCommanders(db, undefined, { colors: "R" });
    expect(red.owned.map((c) => c.name)).toEqual(["Goblin Boss"]);
    expect(red.popular).toEqual([]);
    const rakdos = await suggestCommanders(db, undefined, { colors: "BR" });
    expect(rakdos.owned).toEqual([]);
    expect(rakdos.popular.map((c) => c.name)).toEqual(["Rakdos Test Lord"]); // not owned, from card data
    const themed = await suggestCommanders(db, "aristocrats", { colors: "B" });
    expect(themed.owned.map((c) => c.name)).toEqual(["Bloodthirsty Lord"]);
    expect((await suggestCommanders(db, "aristocrats", { colors: "BR" })).popular.map((c) => c.name)).toEqual(["Rakdos Test Lord"]);
  });

  it("lists decks with progress", async () => {
    const d = await createDeck(db, { commanderOracleId: id("Goblin Boss"), status: "building" });
    await rebuildDeck(db, d.id, { suggestUnowned: false });
    const list = await listDecks(db);
    expect(list[0].commanders[0].name).toBe("Goblin Boss");
    expect(list[0].progress.placed).toBe(list[0].progress.total);
  });

  it("exports decklists with the owned printing, missing cards and a pull list", async () => {
    const d = await createDeck(db, { commanderOracleId: id("Bloodthirsty Lord"), status: "building" });
    await rebuildDeck(db, d.id);
    const v = (await getDeck(db, d.id))!;
    const mox = exportDeck(v, "moxfield");
    expect(mox).toMatch(/^Commander\n1 Bloodthirsty Lord/);
    expect(mox).toMatch(/1 Grim Altar \(TST\) \d+/);
    expect(exportDeck(v, "missing")).toContain("1 Big Staple");
    expect(exportDeck(v, "missing")).not.toContain("Grim Altar");
    expect(exportDeck(v, "pull")).toMatch(/^Binder 1\n/);
    expect(exportDeck(v, "mtgo")).not.toContain("Commander");
  });

  it("imports a decklist into a locked deck, placing owned copies", async () => {
    const text = ["Commander", "1 Bloodthirsty Lord", "", "Deck", "1 Grim Altar (TST) 3", "1 Big Staple", "10 Swamp", "1 Not A Real Card", "", "Maybeboard", "1 Blood Pact"].join("\n");
    const r = await importDecklist(db, text, { name: "Imported", status: "building" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.unmatched).toEqual(["Not A Real Card"]);
    const v = (await getDeck(db, r.deck.id))!;
    expect(v.deck.name).toBe("Imported");
    expect(v.commanders[0].name).toBe("Bloodthirsty Lord");
    expect(v.cards.find((c) => c.name === "Grim Altar")).toMatchObject({ state: "placed", locked: true });
    expect(v.cards.find((c) => c.name === "Swamp")?.locked).toBe(false);
    expect(v.cards.find((c) => c.name === "Big Staple")?.state).toBe("not-owned");
    expect(v.cards.find((c) => c.name === "Swamp")?.quantity).toBe(10);
    expect(v.cards.find((c) => c.name === "Blood Pact")?.board).toBe("maybe");
    // Rebuilding fills the rest of the 100 around the imported cards.
    await rebuildDeck(db, r.deck.id);
    const after = (await getDeck(db, r.deck.id))!;
    expect(after.progress.total).toBe(100);
    expect(after.cards.find((c) => c.name === "Big Staple")?.locked).toBe(true);
  });

  it("asks which card is the commander when the list doesn't say", async () => {
    const r = await importDecklist(db, "1 Bloodthirsty Lord\n1 Goblin Boss\n1 Grim Altar");
    expect(r).toMatchObject({ ok: false, reason: "no-commander" });
    if (r.ok || r.reason !== "no-commander") return;
    expect(r.candidates.map((c) => c.name).sort()).toEqual(["Bloodthirsty Lord", "Goblin Boss"]);
    const ok = await importDecklist(db, "1 Bloodthirsty Lord\n1 Goblin Boss\n1 Grim Altar", { commanderOracleId: id("Bloodthirsty Lord") });
    expect(ok.ok).toBe(true);
  });

  it("copies a deck as an Idea with the same list, holding none of your copies", async () => {
    const deck = await createDeck(db, { commanderOracleId: id("Bloodthirsty Lord"), status: "building" });
    await updateDeck(db, deck.id, { notes: "Try more removal" });
    await addDeckCard(db, deck.id, id("Grim Altar"));
    await addDeckCard(db, deck.id, id("Big Staple"), { acquire: "proxy" });
    const before = (await getDeck(db, deck.id))!;
    expect(before.cards.find((c) => c.name === "Grim Altar")!.state).toBe("placed");
    const copy = (await copyDeck(db, deck.id))!;
    expect(copy.name).toBe(`${deck.name} (copy)`);
    expect(copy.status).toBe("idea");
    expect(copy.notes).toBe("Try more removal");
    const v = (await getDeck(db, copy.id))!;
    expect(v.cards.filter((c) => c.board === "main").map((c) => c.name).sort()).toEqual(["Big Staple", "Grim Altar"]);
    expect(v.cards.find((c) => c.name === "Big Staple")!.acquire).toBe("proxy");
    const rows = await db.select().from(deckCards).where(eq(deckCards.deckId, copy.id));
    expect(rows.every((r) => r.collectionItemId === null)).toBe(true);
    expect(rows.filter((r) => r.board === "commander").length).toBe(1);
    // The original keeps its copy.
    expect((await getDeck(db, deck.id))!.cards.find((c) => c.name === "Grim Altar")!.state).toBe("placed");
    expect(await copyDeck(db, 9999)).toBeUndefined();
  });

  it("lists the tokens a deck makes, and counts cards not yet checked", async () => {
    const goblin = { ...fake("Goblin Token Test", { type: "Token Creature — Goblin" }), layout: "token" } as ScryfallCard;
    const maker = {
      ...fake("Goblin Maker Test", { type: "Legendary Creature — Goblin", ci: "R", cost: "{R}" }),
      all_parts: [{ id: goblin.id, component: "token", name: "Goblin Token Test" }],
    } as ScryfallCard;
    await storeScryfallCards(db, [goblin, maker]);
    const deck = await createDeck(db, { commanderOracleId: maker.oracle_id!, status: "idea" });
    await addDeckCard(db, deck.id, id("Shock Test"));
    await rebuildDeck(db, deck.id).catch(() => undefined);
    const t = await deckTokens(db, deck.id);
    const g = t.tokens.find((x) => x.name === "Goblin Token Test")!;
    expect(g.makers).toEqual(["Goblin Maker Test"]);
    expect(g.id).toBe(goblin.id);
    expect(g.imageNormal).toBe("n.jpg");
  });

  it("keeps roles and tags you set, locks the card, and goes back to automatic", async () => {
    const deck = await createDeck(db, { commanderOracleId: id("Bloodthirsty Lord"), status: "building" });
    await addDeckCard(db, deck.id, id("Grim Altar"));
    const row = () => getDeck(db, deck.id).then((v) => v!.cards.find((c) => c.name === "Grim Altar")!);
    const r = await row();
    await updateDeckCard(db, deck.id, r.id, { locked: false });
    await updateDeckCard(db, deck.id, r.id, { roles: ["removal"], tags: [" Wincon ", "Wincon", "Pet"] });
    let after = await row();
    expect(after.roleOverride).toEqual(["removal"]);
    expect(after.role).toBe("removal");
    expect(after.tags).toEqual(["Wincon", "Pet"]);
    expect(after.locked).toBe(true);
    await rebuildDeck(db, deck.id);
    expect((await row()).tags).toEqual(["Wincon", "Pet"]);
    await updateDeckCard(db, deck.id, r.id, { roles: null, tags: [] });
    after = await row();
    expect(after.roleOverride).toBeNull();
    expect(after.tags).toEqual([]);
    expect(after.role).toBe("ramp");
  });

  it("gathers one want list across decks, with your own adds, leaving out proxies and retired decks", async () => {
    const a = await createDeck(db, { commanderOracleId: id("Bloodthirsty Lord"), status: "building", name: "A" });
    const b = await createDeck(db, { commanderOracleId: id("Rakdos Test Lord"), status: "idea", name: "B" });
    const r = await createDeck(db, { commanderOracleId: id("Rakdos Test Lord"), status: "retired", name: "R" });
    await addDeckCard(db, a.id, id("Big Staple"));
    await addDeckCard(db, b.id, id("Big Staple"));
    await addDeckCard(db, r.id, id("Big Staple"));
    // You own one Grim Altar; two decks want it, so one is short.
    await addDeckCard(db, a.id, id("Grim Altar"));
    await addDeckCard(db, b.id, id("Grim Altar"));
    await addDeckCard(db, a.id, id("Shock Test"), { acquire: "proxy" });
    await addWant(db, id("Mind Stone Test"), 2);
    const list = await wantList(db);
    const by = (n: string) => list.find((w) => w.name === n);
    expect(by("Big Staple")).toMatchObject({ needed: 2, owned: 0, short: 2, mine: 0 });
    expect(by("Big Staple")!.decks.map((d) => d.name)).toEqual(["A", "B"]);
    expect(by("Grim Altar")).toMatchObject({ needed: 2, owned: 1, short: 1 });
    expect(by("Shock Test")).toBeUndefined();
    expect(by("Mind Stone Test")).toMatchObject({ mine: 2, short: 2, decks: [] });
    expect(by("Swamp")).toBeUndefined();
    // Commanders you don't own are wanted too.
    expect(by("Rakdos Test Lord")).toMatchObject({ short: 1 });
    await addWant(db, id("Mind Stone Test"));
    expect((await wantList(db)).find((w) => w.name === "Mind Stone Test")!.mine).toBe(3);
    await removeWant(db, id("Mind Stone Test"));
    expect((await wantList(db)).find((w) => w.name === "Mind Stone Test")).toBeUndefined();
  });
});
