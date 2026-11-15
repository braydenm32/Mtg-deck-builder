import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import { cardsByName, searchCardNames } from "@/lib/cards/lookup";
import { canBeCommander } from "@/lib/cards/rows";
import { storeScryfallCards } from "@/lib/cards/store";
import type { ScryfallCard } from "@/lib/scryfall/client";
import { tempDb } from "./helpers";

const base = { object: "card", lang: "en", set: "tst", set_name: "Test", rarity: "rare", color_identity: [], cmc: 0, prices: {} } as const;
const real = { ...base, id: "00000000-0000-4000-8000-000000000001", oracle_id: "10000000-0000-4000-8000-000000000001", name: "Mutavault", layout: "normal", type_line: "Land", oracle_text: "{T}: Add {C}.", legalities: { commander: "legal" }, collector_number: "1" } as unknown as ScryfallCard;
const blank = { ...base, id: "00000000-0000-4000-8000-000000000003", oracle_id: "10000000-0000-4000-8000-000000000003", name: "_____", layout: "normal", type_line: "Creature — Shapeshifter", oracle_text: "", legalities: { commander: "legal" }, collector_number: "2" } as unknown as ScryfallCard;
const token = { ...base, id: "00000000-0000-4000-8000-000000000002", oracle_id: "10000000-0000-4000-8000-000000000002", name: "Mutavault", layout: "token", type_line: "Legendary Creature — Shapeshifter", oracle_text: "", legalities: { commander: "not_legal" }, collector_number: "T1" } as unknown as ScryfallCard;

describe("non-deck layouts", () => {
  let db: Db;
  let cleanup: () => void;
  beforeAll(async () => {
    ({ db, cleanup } = await tempDb());
    // Token stored first, so a naive lookup would find it first.
    await storeScryfallCards(db, [token, real, blank]);
  });
  afterAll(() => cleanup());

  it("name lookups put the real card before its token twin", async () => {
    const found = await cardsByName(db, "Mutavault");
    expect(found.map((c) => c.layout)).toEqual(["normal", "token"]);
  });

  it("a line of punctuation matches no card, but \"_____\" still finds its card", async () => {
    expect(await cardsByName(db, "???")).toEqual([]);
    expect((await cardsByName(db, "_____")).map((c) => c.name)).toEqual(["_____"]);
  });

  it("deck searches leave tokens out", async () => {
    expect(await searchCardNames(db, "mutav", 20, { identity: "" })).toHaveLength(1);
    expect(await searchCardNames(db, "mutav", 20, { commander: true })).toHaveLength(0);
  });

  it("a legendary token is never a commander", () => {
    expect(canBeCommander(token)).toBe(false);
  });
});

describe("canBeCommander", () => {
  it("accepts legendary Spacecraft and Vehicles with power and toughness", () => {
    expect(canBeCommander({ type_line: "Legendary Artifact — Spacecraft", oracle_text: "Station", power: "5", toughness: "5", layout: "normal" })).toBe(true);
    expect(canBeCommander({ type_line: "Legendary Artifact — Vehicle", oracle_text: "Crew 3", power: "6", toughness: "6", layout: "normal" })).toBe(true);
  });
  it("rejects Spacecraft without power and toughness, and non-legendary Vehicles", () => {
    expect(canBeCommander({ type_line: "Legendary Artifact — Spacecraft", oracle_text: "Station" })).toBe(false);
    expect(canBeCommander({ type_line: "Artifact — Vehicle", oracle_text: "Crew 1", power: "3", toughness: "3" })).toBe(false);
  });
});
