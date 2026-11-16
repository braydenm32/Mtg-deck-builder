import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import { makeBackup, parseBackup, restoreBackup } from "@/lib/backup";
import { storeScryfallCards } from "@/lib/cards/store";
import { addPackageToDeck, createPackage, deckTags, getPackage, listPackages, removePackageCard, undoPackageAdd } from "@/lib/deck/packages";
import { setDeckShared, sharedDeck, sharedDecklist } from "@/lib/deck/share";
import { addDeckCard, createDeck, getDeck, updateDeckCard } from "@/lib/deck/store";
import type { ScryfallCard } from "@/lib/scryfall/client";
import { tempDb } from "./helpers";

let n = 0;
function fake(name: string, type = "Instant", ci = ""): ScryfallCard {
  n += 1;
  const hex = n.toString(16).padStart(12, "0");
  return {
    object: "card",
    id: `50000000-0000-4000-8000-${hex}`,
    oracle_id: `51111111-0000-4000-8000-${hex}`,
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

const LEADER = fake("Test Leader", "Legendary Creature — Human", "W");
const SWORDS = fake("Swords", "Instant", "W");
const BEAST = fake("Beast", "Instant", "G");
const RING = fake("Ring", "Artifact");
const ELF = fake("Elf", "Creature — Elf", "W");

let db: Db;
let cleanup: () => void;
let deckId: number;
beforeEach(async () => {
  ({ db, cleanup } = await tempDb());
  await storeScryfallCards(db, [LEADER, SWORDS, BEAST, RING, ELF]);
  deckId = (await createDeck(db, { commanderOracleId: LEADER.oracle_id!, name: "Test deck", status: "idea" })).id;
  await addDeckCard(db, deckId, RING.oracle_id!);
  await addDeckCard(db, deckId, ELF.oracle_id!);
});
afterEach(() => cleanup());

describe("read-only deck link", () => {
  it("shows the list by type with nothing private, and stops working when turned off", async () => {
    const token = (await setDeckShared(db, deckId, true))!;
    expect(token).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(await setDeckShared(db, deckId, true)).toBe(token); // keeps its link
    const d = (await sharedDeck(db, token))!;
    expect(d).toMatchObject({ name: "Test deck", count: 3, bracket: 3, commanders: [{ name: "Test Leader" }] });
    expect(d.groups.map((g) => g.type)).toEqual(["Creature", "Artifact"]);
    expect(JSON.stringify(d)).not.toMatch(/notes|price|location|acquire/i);
    expect(sharedDecklist(d)).toBe("1 Test Leader\n\n1 Elf\n1 Ring");

    expect(await setDeckShared(db, deckId, false)).toBeNull();
    expect(await sharedDeck(db, token)).toBeUndefined();
    expect(await sharedDeck(db, "x")).toBeUndefined();
    expect(await setDeckShared(db, 999, true)).toBeUndefined();
  });
});

describe("card packages", () => {
  it("adds to a deck, skipping cards off-colour or already in it, and undoes it", async () => {
    await addDeckCard(db, deckId, SWORDS.oracle_id!, { board: "maybe" });
    const p = await createPackage(db, { name: "Removal", oracleIds: [SWORDS.oracle_id!, BEAST.oracle_id!, RING.oracle_id!, "unknown"] });
    expect((await getPackage(db, p.id))!.cards.map((c) => c.name)).toEqual(["Beast", "Ring", "Swords"]);
    expect((await listPackages(db))[0]).toMatchObject({ name: "Removal", colorIdentity: "WG" });

    const r = (await addPackageToDeck(db, p.id, deckId))!;
    expect(r).toMatchObject({ added: ["Swords"], offColour: ["Beast"], already: ["Ring"] });
    let v = (await getDeck(db, deckId))!;
    expect(v.cards.find((c) => c.name === "Swords")).toMatchObject({ board: "main", locked: true });

    await undoPackageAdd(db, deckId, r.undo);
    v = (await getDeck(db, deckId))!;
    expect(v.cards.find((c) => c.name === "Swords")?.board).toBe("maybe");

    await removePackageCard(db, p.id, SWORDS.oracle_id!);
    expect((await getPackage(db, p.id))!.cards).toHaveLength(2);
  });

  it("starts from a deck's tag and comes through a backup", async () => {
    const row = (await getDeck(db, deckId))!.cards.find((c) => c.name === "Ring")!;
    await updateDeckCard(db, deckId, row.id, { tags: ["Ramp pack"] });
    expect(await deckTags(db)).toEqual([{ deckId, deckName: "Test deck", tag: "Ramp pack", oracleIds: [RING.oracle_id] }]);

    await createPackage(db, { name: "Ramp pack", oracleIds: [RING.oracle_id!] });
    const parsed = parseBackup(JSON.stringify(await makeBackup(db)));
    if (!parsed.ok) throw new Error(parsed.error);
    await createPackage(db, { name: "Later" });
    await restoreBackup(db, parsed.backup);
    const list = await listPackages(db);
    expect(list.map((p) => [p.name, p.cards.length])).toEqual([["Ramp pack", 1]]);
  });
});
