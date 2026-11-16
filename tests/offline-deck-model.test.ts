import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import { cards, collectionItems } from "@/db/schema";
import { DETAIL_FIELDS, detailRow } from "@/lib/cards/details";
import { storeScryfallCards } from "@/lib/cards/store";
import type { ScryfallCard } from "@/lib/scryfall/client";
import { inputsFor } from "@/lib/deck/analysis";
import { addDeckCard, createDeck, getDeck, ownedSummary, removeDeckCard, restoreDeckCard, setDeckStatus, updateDeckCard } from "@/lib/deck/store";
import { deckVersion } from "@/lib/deck/version";
import type { DeckEdit, NewDeckEdit } from "@/lib/offline/deck-edits";
import { applyDeckEdits, pendingRowId, tabCounts, type CardDetail, type OwnedIndex } from "@/lib/offline/deck-model";
import { tempDb } from "./helpers";

process.env.EDHREC_ENABLED = "false";

let n = 0;
function fake(name: string, o: { type?: string; text?: string; ci?: string; cost?: string; cmc?: number; price?: number } = {}): ScryfallCard {
  n += 1;
  const hex = n.toString(16).padStart(12, "0");
  return {
    object: "card",
    id: `00000000-0000-4000-8000-${hex}`,
    oracle_id: `22222222-0000-4000-8000-${hex}`,
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
    finishes: ["nonfoil"],
    edhrec_rank: 5000,
    prices: { usd: o.price !== undefined ? String(o.price) : "0.50" },
    image_uris: { small: "s.jpg", normal: "n.jpg" },
  } as unknown as ScryfallCard;
}

const CARDS = [
  fake("Bloodthirsty Lord", { type: "Legendary Creature — Vampire", ci: "B", cost: "{2}{B}{B}", cmc: 4 }),
  fake("Grim Altar", { type: "Artifact", text: "Sacrifice a creature: Add {B}.", cost: "{2}" }),
  fake("Blood Pact", { type: "Enchantment", text: "Whenever a creature you control dies, draw a card.", ci: "B", cost: "{1}{B}" }),
  fake("Doom Blade Test", { type: "Instant", text: "Destroy target nonblack creature.", ci: "B", cost: "{1}{B}" }),
  fake("Mind Stone Test", { type: "Artifact", text: "{T}: Add {C}.", cost: "{2}" }),
  fake("Big Staple", { type: "Sorcery", text: "Destroy all creatures.", ci: "B", cost: "{2}{B}{B}", cmc: 4, price: 12 }),
  fake("Shared Thing", { type: "Artifact", text: "Whenever a creature dies, scry 1.", cost: "{3}", cmc: 3 }),
  fake("Swamp", { type: "Basic Land — Swamp", text: "({T}: Add {B}.)", ci: "B", cost: "", cmc: 0 }),
  fake("Bog Test", { type: "Land", text: "{T}: Add {B}.", ci: "B", cost: "", cmc: 0 }),
];
const id = (name: string) => CARDS.find((c) => c.name === name)!.oracle_id!;

async function own(db: Db, name: string, quantity = 1) {
  const c = CARDS.find((x) => x.name === name)!;
  await db.insert(collectionItems).values({ printingId: c.id, oracleId: c.oracle_id!, quantity, source: "manual", addedAt: new Date().toISOString(), location: "Binder 1" });
}

let db: Db;
let cleanup: () => void;
beforeEach(async () => {
  ({ db, cleanup } = await tempDb());
  await storeScryfallCards(db, CARDS);
  for (const name of ["Bloodthirsty Lord", "Grim Altar", "Blood Pact", "Mind Stone Test", "Shared Thing", "Bog Test"]) await own(db, name);
});
afterEach(() => cleanup());

/** What the device would have: the card details and what you own. */
async function deviceData(): Promise<{ details: Map<string, CardDetail>; owned: OwnedIndex }> {
  const rows = await db.select().from(cards);
  const details = new Map(rows.map((c) => [c.oracleId, Object.fromEntries(DETAIL_FIELDS.map((f, i) => [f, detailRow(c)[i]])) as CardDetail]));
  const sum = await ownedSummary(db);
  return { details, owned: { decks: new Map(sum.decks), cards: new Map(sum.cards.map((c) => [c[0], c])) } };
}

/** The parts of a deck its tabs show as numbers. */
function shown(v: Awaited<ReturnType<typeof getDeck>> & object) {
  return {
    rows: v.cards
      .map((c) => ({ name: c.name, board: c.board, quantity: c.quantity, locked: c.locked, acquire: c.acquire, state: c.state, role: c.role, cmc: c.cmc }))
      .sort((a, b) => a.name.localeCompare(b.name) || a.board.localeCompare(b.board)),
    progress: v.progress,
    costToFinish: v.costToFinish,
    counts: tabCounts(v),
  };
}

let k = 0;
const edit = (e: NewDeckEdit): DeckEdit => ({ ...e, key: `e${k++}`, at: 0 }) as DeckEdit;

describe("a deck as edits leave it, on the device", () => {
  it("agrees with the server after removing, moving, adding (from suggestions and from search) and putting back", async () => {
    // A second deck holds the only copy of Shared Thing.
    const other = await createDeck(db, { commanderOracleId: id("Bloodthirsty Lord"), name: "Other", status: "building" });
    await addDeckCard(db, other.id, id("Shared Thing"));
    const d = await createDeck(db, { commanderOracleId: id("Bloodthirsty Lord"), status: "building" });
    for (const name of ["Grim Altar", "Blood Pact", "Doom Blade Test", "Swamp"]) await addDeckCard(db, d.id, id(name));
    await addDeckCard(db, d.id, id("Mind Stone Test"), { board: "maybe" });
    const base = (await getDeck(db, d.id))!;
    const row = (name: string) => base.cards.find((c) => c.name === name)!;
    const card = (name: string) => ({ oracleId: row(name).oracleId, name, board: row(name).board, locked: row(name).locked, acquire: row(name).acquire });

    const edits: DeckEdit[] = [
      edit({ kind: "remove", deckId: d.id, rowId: row("Blood Pact").id, card: card("Blood Pact") }),
      edit({ kind: "patch", deckId: d.id, rowId: row("Mind Stone Test").id, card: card("Mind Stone Test"), patch: { board: "main" } }),
      edit({ kind: "patch", deckId: d.id, rowId: row("Doom Blade Test").id, card: card("Doom Blade Test"), patch: { acquire: "proxy" } }),
      edit({ kind: "patch", deckId: d.id, rowId: row("Grim Altar").id, card: card("Grim Altar"), patch: { locked: false } }),
      edit({ kind: "add", deckId: d.id, oracleId: id("Big Staple"), name: "Big Staple", board: "main" }),
      edit({ kind: "add", deckId: d.id, oracleId: id("Shared Thing"), name: "Shared Thing", board: "main" }),
      edit({ kind: "add", deckId: d.id, oracleId: id("Bog Test"), name: "Bog Test", board: "main" }),
      edit({ kind: "add", deckId: d.id, oracleId: id("Swamp"), name: "Swamp", board: "main" }),
    ];
    const device = applyDeckEdits(base, edits, await deviceData());

    // The same edits on the server.
    const pact = await removeDeckCard(db, d.id, row("Blood Pact").id);
    await updateDeckCard(db, d.id, row("Mind Stone Test").id, { board: "main" });
    await updateDeckCard(db, d.id, row("Doom Blade Test").id, { acquire: "proxy" });
    await updateDeckCard(db, d.id, row("Grim Altar").id, { locked: false });
    for (const name of ["Big Staple", "Shared Thing", "Bog Test", "Swamp"]) await addDeckCard(db, d.id, id(name));
    const server = (await getDeck(db, d.id))!;
    expect(shown(device)).toEqual(shown(server));
    expect(device.cards.find((c) => c.name === "Shared Thing")?.inDecks).toEqual([{ id: other.id, name: "Other" }]);

    // Putting the removed card back.
    const back = edit({ kind: "restore", deckId: d.id, removed: pact as never, name: "Blood Pact" });
    await restoreDeckCard(db, pact!);
    expect(shown(applyDeckEdits(base, [...edits, back], await deviceData()))).toEqual(shown((await getDeck(db, d.id))!));
  });

  it("agrees with the server for an idea, which holds no copies", async () => {
    const d = await createDeck(db, { commanderOracleId: id("Bloodthirsty Lord") });
    await addDeckCard(db, d.id, id("Grim Altar"), { board: "maybe" });
    const base = (await getDeck(db, d.id))!;
    const altar = base.cards[0];
    const edits = [
      edit({ kind: "patch", deckId: d.id, rowId: altar.id, card: { oracleId: altar.oracleId, name: altar.name, board: "maybe", locked: true, acquire: null }, patch: { board: "main" } }),
      edit({ kind: "add", deckId: d.id, oracleId: id("Blood Pact"), name: "Blood Pact", board: "main" }),
      edit({ kind: "add", deckId: d.id, oracleId: id("Big Staple"), name: "Big Staple", board: "maybe" }),
    ];
    const device = applyDeckEdits(base, edits, await deviceData());
    await updateDeckCard(db, d.id, altar.id, { board: "main" });
    await addDeckCard(db, d.id, id("Blood Pact"));
    await addDeckCard(db, d.id, id("Big Staple"), { board: "maybe" });
    expect(shown(device)).toEqual(shown((await getDeck(db, d.id))!));
    expect(device.progress.placed).toBeGreaterThan(base.progress.placed);
  });

  it("gives cards added on the device a stable negative id and the add's key", async () => {
    const d = await createDeck(db, { commanderOracleId: id("Bloodthirsty Lord"), status: "building" });
    const base = (await getDeck(db, d.id))!;
    const add = edit({ kind: "add", deckId: d.id, oracleId: id("Blood Pact"), name: "Blood Pact", board: "main" });
    const [row] = applyDeckEdits(base, [add], await deviceData()).cards;
    expect(row.id).toBe(pendingRowId(add.key));
    expect(row.id).toBeLessThan(0);
    expect(row.pendingKey).toBe(add.key);
    expect(row.state).toBe("placed");
  });

  it("skips edits for rows that are gone and for other decks, and counts a card it has no data for", async () => {
    const d = await createDeck(db, { commanderOracleId: id("Bloodthirsty Lord"), status: "building" });
    await addDeckCard(db, d.id, id("Grim Altar"));
    const base = (await getDeck(db, d.id))!;
    const card = { oracleId: "x", name: "Gone", board: "main", locked: false, acquire: null };
    const out = applyDeckEdits(base, [
      edit({ kind: "remove", deckId: d.id, rowId: 99999, card }),
      edit({ kind: "remove", deckId: d.id + 1, rowId: base.cards[0].id, card }),
      edit({ kind: "add", deckId: d.id, oracleId: "unknown", name: "Mystery Card", board: "main" }),
    ]);
    expect(out.cards.map((c) => [c.name, c.state])).toEqual([
      ["Grim Altar", "placed"],
      ["Mystery Card", "no-data"],
    ]);
    expect(out.progress.total).toBe(base.progress.total + 1);
  });

  it("changes the deck's version when its cards change, and only then", async () => {
    const d = await createDeck(db, { commanderOracleId: id("Bloodthirsty Lord"), status: "building" });
    await addDeckCard(db, d.id, id("Grim Altar"));
    const a = deckVersion((await getDeck(db, d.id))!);
    expect(deckVersion((await getDeck(db, d.id))!)).toBe(a);
    await setDeckStatus(db, d.id, "idea");
    expect(deckVersion((await getDeck(db, d.id))!)).not.toBe(a);
  });
});

describe("combos found again on the device", () => {
  const combo = (cards: string[]) => ({ cards, result: "Infinite something" });
  const kept = { source: "spellbook" as const, combos: [], near: [], pool: [combo(["Grim Altar", "Blood Pact"]), combo(["Grim Altar", "Big Staple"])] };
  const deck = (names: string[]) => ({ commanders: [], cards: names.map((name) => ({ name, board: "main" })) }) as never;

  it("finds complete and one-card-away combos among the ones Spellbook gave", () => {
    const both = inputsFor(deck(["Grim Altar", "Blood Pact"]), kept, new Set(["Big Staple"]));
    expect(both.combos.map((c) => c.cards)).toEqual([["Grim Altar", "Blood Pact"]]);
    expect(both.near.map((x) => [x.missing, x.owned])).toEqual([["Big Staple", true]]);
    // Removing a piece turns the combo into one a card away.
    const one = inputsFor(deck(["Grim Altar"]), kept, new Set());
    expect(one.combos).toEqual([]);
    expect(one.near.map((x) => x.missing).sort()).toEqual(["Big Staple", "Blood Pact"]);
  });
});
