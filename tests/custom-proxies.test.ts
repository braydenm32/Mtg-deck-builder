import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import { makeBackup, parseBackup, restoreBackup } from "@/lib/backup";
import { createCustomCard, customCardRow, deleteCustomCard, listCustomCards, manaValueOf, updateCustomCard } from "@/lib/cards/custom";
import { searchCardNames } from "@/lib/cards/lookup";
import { proxyCards, proxyPages, type ProxyRow } from "@/lib/deck/proxies";
import { addDeckCard, createDeck, getDeck } from "@/lib/deck/store";
import { seededDb } from "./helpers";

describe("custom card rows", () => {
  it("works out mana value, colours and identity like the rules do", () => {
    expect(manaValueOf("{2}{G}{G}")).toBe(4);
    expect(manaValueOf("{X}{U/P}{2/W}")).toBe(3);
    const row = customCardRow({ name: "  Grove  Keeper ", manaCost: "{1}{G}", typeLine: "Legendary Creature — Elf", oracleText: "{T}: Add {W}." }, "id-1");
    expect(row).toMatchObject({ name: "Grove Keeper", cmc: 2, colors: "G", colorIdentity: "WG", canBeCommander: true, custom: true, paper: false, legalCommander: "legal" });
  });
});

describe("custom cards in decks", () => {
  let db: Db;
  let cleanup: () => void;
  let leader: string;
  beforeAll(async () => {
    ({ db, cleanup } = await seededDb());
    const made = await createCustomCard(db, { name: "Playtest Leader", manaCost: "{2}{B}{G}", typeLine: "Legendary Creature — Elf", oracleText: "Whenever you sacrifice a creature, draw a card." });
    if ("error" in made) throw new Error(made.error);
    leader = made.oracleId;
  });
  afterAll(() => cleanup());

  it("won't reuse a real card's name", async () => {
    expect(await createCustomCard(db, { name: "Sol Ring", typeLine: "Artifact" })).toEqual({ error: "A card already has that name. Pick another." });
  });

  it("is found by search, can lead a deck, and goes in as a proxy", async () => {
    expect((await searchCardNames(db, "playtest lea", 5, { commander: true })).map((c) => c.name)).toEqual(["Playtest Leader"]);
    const made = await createCustomCard(db, { name: "Spoiled Ramp", manaCost: "{1}{G}", typeLine: "Sorcery", oracleText: "Search your library for a basic land card." });
    if ("error" in made) throw new Error(made.error);
    const deck = await createDeck(db, { commanderOracleId: leader, status: "building" });
    await addDeckCard(db, deck.id, made.oracleId);
    const v = await getDeck(db, deck.id);
    const row = v.cards.find((c) => c.oracleId === made.oracleId)!;
    expect(row).toMatchObject({ acquire: "proxy", custom: true, state: "not-owned" });
    expect(proxyCards([...v.commanderSlots, ...v.cards], "marked").map((c) => c.name).sort()).toEqual(["Playtest Leader", "Spoiled Ramp"]);
    // Counted per card: the leader is in no deck's 99, but leads this one.
    await createDeck(db, { commanderOracleId: leader, name: "Second", status: "idea" });
    const listed = await listCustomCards(db);
    expect(listed.find((c) => c.name === "Spoiled Ramp")?.decks).toBe(1);
    expect(listed.find((c) => c.name === "Playtest Leader")?.decks).toBe(2);

    expect(await updateCustomCard(db, made.oracleId, { name: "Spoiled Ramp", manaCost: "{2}{G}", typeLine: "Sorcery" })).toEqual({ ok: true });
    expect((await getDeck(db, deck.id)).cards.find((c) => c.oracleId === made.oracleId)?.cmc).toBe(3);

    // A backup keeps your cards, so a restored deck still has them.
    const parsed = parseBackup(JSON.stringify(await makeBackup(db)));
    if (!parsed.ok) throw new Error(parsed.error);
    expect(parsed.backup.customCards?.map((c) => c.name).sort()).toEqual(["Playtest Leader", "Spoiled Ramp"]);
    const other = await seededDb();
    try {
      expect((await restoreBackup(other.db, parsed.backup, { online: false })).ok).toBe(true);
      expect((await listCustomCards(other.db)).map((c) => c.name)).toEqual(["Playtest Leader", "Spoiled Ramp"]);
    } finally {
      other.cleanup();
    }

    expect(await deleteCustomCard(db, made.oracleId)).toEqual({ removedFromDecks: 1 });
    expect(await deleteCustomCard(db, leader)).toEqual({ error: expect.stringContaining("It's the commander of") });
    expect((await getDeck(db, deck.id)).cards.some((c) => c.oracleId === made.oracleId)).toBe(false);
    expect(await deleteCustomCard(db, "not-a-card")).toBeUndefined();
  });
});

describe("proxy sheet", () => {
  const row = (name: string, o: Partial<ProxyRow> = {}): ProxyRow => ({
    name,
    quantity: 1,
    board: "main",
    state: "not-owned",
    acquire: null,
    basic: false,
    imageNormal: `${name}.jpg`,
    custom: false,
    manaCost: null,
    typeLine: "",
    oracleText: "",
    ...o,
  });
  const rows = [
    row("Marked", { acquire: "proxy" }),
    row("To buy", { acquire: "buy" }),
    row("Owned", { state: "placed" }),
    row("Forest", { basic: true, quantity: 3, state: "placed" }),
    row("Maybe", { board: "maybe", acquire: "proxy" }),
    row("Leader", { board: "commander", state: "placed" }),
  ];

  it("picks the cards, one per copy", () => {
    expect(proxyCards(rows, "marked").map((c) => c.name)).toEqual(["Marked"]);
    expect(proxyCards(rows, "missing").map((c) => c.name)).toEqual(["Marked", "To buy"]);
    expect(proxyCards(rows, "all").map((c) => c.name)).toEqual(["Marked", "To buy", "Owned", "Forest", "Forest", "Forest", "Leader"]);
  });

  it("fills pages of nine", () => {
    expect(proxyPages(Array.from({ length: 19 }, (_, i) => i)).map((p) => p.length)).toEqual([9, 9, 1]);
    expect(proxyPages([])).toEqual([]);
  });
});
