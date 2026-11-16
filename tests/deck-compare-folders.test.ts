import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import { storeScryfallCards } from "@/lib/cards/store";
import { compareDecks } from "@/lib/deck/compare";
import { arrangeDecks, folderCounts } from "@/lib/deck/folders";
import { addDeckCard, createDeck, deckFolders, getDeck, listDecks, updateDeck } from "@/lib/deck/store";
import type { ScryfallCard } from "@/lib/scryfall/client";
import { tempDb } from "./helpers";

let n = 0;
function fake(name: string, type = "Instant", ci = ""): ScryfallCard {
  n += 1;
  const hex = n.toString(16).padStart(12, "0");
  return {
    object: "card",
    id: `60000000-0000-4000-8000-${hex}`,
    oracle_id: `61111111-0000-4000-8000-${hex}`,
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
    prices: { usd: "1.00" },
    image_uris: { small: "s.jpg", normal: "n.jpg" },
  } as unknown as ScryfallCard;
}

const A_LEAD = fake("Leader One", "Legendary Creature — Human", "W");
const B_LEAD = fake("Leader Two", "Legendary Creature — Elf", "W");
const RING = fake("Ring", "Artifact");
const ELF = fake("Elf", "Creature — Elf", "W");
const BOLT = fake("Swords", "Instant", "W");
const PLAINS = fake("Plains", "Basic Land — Plains");

let db: Db;
let cleanup: () => void;
let a: number;
let b: number;
beforeEach(async () => {
  ({ db, cleanup } = await tempDb());
  await storeScryfallCards(db, [A_LEAD, B_LEAD, RING, ELF, BOLT, PLAINS]);
  a = (await createDeck(db, { commanderOracleId: A_LEAD.oracle_id!, name: "One", status: "idea" })).id;
  b = (await createDeck(db, { commanderOracleId: B_LEAD.oracle_id!, name: "Two", status: "idea" })).id;
  for (const c of [RING, ELF, PLAINS]) await addDeckCard(db, a, c.oracle_id!);
  for (const c of [RING, BOLT, PLAINS]) await addDeckCard(db, b, c.oracle_id!);
});
afterEach(() => cleanup());

describe("compare two decks", () => {
  it("lines them up, with the cards both play and each one's own (basics left out)", async () => {
    const r = compareDecks((await getDeck(db, a))!, (await getDeck(db, b))!);
    expect(r.a.name).toBe("One");
    expect(r.shared).toEqual(["Ring"]);
    expect(r.onlyA).toEqual(["Elf", "Leader One"]);
    expect(r.onlyB).toEqual(["Leader Two", "Swords"]);
    expect(r.lines.find((l) => l.label === "Cards")).toMatchObject({ a: 4, b: 4 });
    expect(r.lines.find((l) => l.label === "Creatures")).toMatchObject({ a: 1, b: 0 });
  });
});

describe("deck folders and pins", () => {
  it("files and pins a deck without counting it as a change", async () => {
    const before = (await getDeck(db, a))!.deck.updatedAt;
    await updateDeck(db, a, { folder: "  Pod night ", pinned: true });
    const d = (await getDeck(db, a))!.deck;
    expect(d).toMatchObject({ folder: "Pod night", pinned: true, updatedAt: before });
    expect(await deckFolders(db)).toEqual(["Pod night"]);
    await updateDeck(db, a, { folder: "" });
    expect((await getDeck(db, a))!.deck.folder).toBeNull();
  });

  it("shows a folder's decks, pinned first", async () => {
    await updateDeck(db, b, { folder: "Pod night", pinned: true });
    await updateDeck(db, a, { folder: "Pod night" });
    const list = await listDecks(db);
    expect(folderCounts(list)).toEqual([{ name: "Pod night", count: 2 }]);
    expect(arrangeDecks(list, "Pod night").map((d) => d.name)).toEqual(["Two", "One"]);
    // A folder that's gone shows everything.
    expect(arrangeDecks(list, "Old").length).toBe(2);
  });
});
