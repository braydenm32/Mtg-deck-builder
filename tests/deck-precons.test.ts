import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import { listPrecons, preconDecklist, preconEntries } from "@/lib/deck/precons";
import { pickSwaps } from "@/lib/deck/swaps";
import type { Candidate } from "@/lib/deck/build";
import { tempDb } from "./helpers";

const deck = {
  commander: [{ name: "Ellivere of the Wild Court", count: 1, isFoil: true, identifiers: { scryfallId: "c1" } }],
  mainBoard: [
    { name: "Sol Ring", count: 1, identifiers: { scryfallId: "s1" } },
    { name: "Plains", count: 12, identifiers: { scryfallId: "p1" } },
    { name: "Etched Thing", count: 1, isFoil: true, isEtched: true, identifiers: { scryfallId: "e1" } },
  ],
};

describe("precons", () => {
  it("reads as a decklist with the commander marked", () => {
    expect(preconDecklist(deck)).toBe("Commander\n1 Ellivere of the Wild Court\n\nDeck\n1 Sol Ring\n12 Plains\n1 Etched Thing");
  });

  it("becomes collection entries in exact printings and finishes", () => {
    const e = preconEntries(deck, "Precon box");
    expect(e.map((x) => [x.identity.scryfallId, x.quantity, x.finish, x.location])).toEqual([
      ["c1", 1, "foil", "Precon box"],
      ["s1", 1, "nonfoil", "Precon box"],
      ["p1", 12, "nonfoil", "Precon box"],
      ["e1", 1, "etched", "Precon box"],
    ]);
  });

  describe("the list", () => {
    let db: Db;
    let cleanup: () => void;
    beforeEach(async () => ({ db, cleanup } = await tempDb()));
    afterEach(() => cleanup());

    it("keeps Commander decks only, newest first, and asks MTGJSON once a week", async () => {
      let calls = 0;
      const fetcher = async () => {
        calls++;
        return {
          data: [
            { fileName: "Old_C13", name: "Old", code: "C13", releaseDate: "2013-11-01", type: "Commander Deck" },
            { fileName: "Starter", name: "Starter", code: "X", releaseDate: "2024-01-01", type: "Starter Kit" },
            { fileName: "New_WOC", name: "New", code: "WOC", releaseDate: "2023-09-08", type: "Commander Deck" },
          ],
        };
      };
      const list = await listPrecons(db, fetcher);
      expect(list.map((p) => p.fileName)).toEqual(["New_WOC", "Old_C13"]);
      await listPrecons(db, fetcher);
      expect(calls).toBe(1);
    });
  });
});

const cand = (name: string, o: Partial<Candidate> = {}): Candidate => ({
  oracleId: `o-${name}`,
  name,
  typeLine: "Creature",
  oracleText: "",
  manaCost: "{2}",
  cmc: 2,
  colorIdentity: "W",
  edhrecRank: 5000,
  priceUsd: 1,
  available: 0,
  owned: 0,
  roles: [],
  theme: 0,
  ...o,
});

describe("swaps from your collection", () => {
  it("puts strong free cards in for the weakest of the same job, and leaves lands and Game Changers past the limit alone", () => {
    const pool = [
      cand("Weak Ramp", { roles: ["ramp"], edhrecRank: 90000 }),
      cand("Weak Beater", { edhrecRank: 90000 }),
      cand("Plains", { typeLine: "Basic Land — Plains", roles: ["land"] }),
      cand("Great Ramp", { roles: ["ramp"], available: 1, owned: 1, edhrec: { synergy: 0.5, inclusion: 0.6 } }),
      cand("Great Beater", { available: 1, owned: 1, edhrec: { synergy: 0.6, inclusion: 0.5 } }),
      cand("Busy Card", { available: 0, owned: 1, edhrec: { synergy: 0.9, inclusion: 0.9 } }),
      cand("Fancy Land", { typeLine: "Land", roles: ["land"], available: 1, owned: 1, edhrec: { synergy: 0.9, inclusion: 0.9 } }),
      cand("Big Gun", { gameChanger: true, available: 1, owned: 1, edhrec: { synergy: 0.9, inclusion: 0.9 } }),
    ];
    const rows = ["Weak Ramp", "Weak Beater", "Plains"].map((n, i) => ({ id: i + 1, oracleId: `o-${n}`, name: n }));
    const swaps = pickSwaps(rows, pool, { hasEdhrec: true, bracket: 2, gameChangers: 0 });
    expect(swaps.map((s) => [s.in.name, s.out.name, s.role])).toEqual([
      ["Great Beater", "Weak Beater", "other"],
      ["Great Ramp", "Weak Ramp", "ramp"],
    ]);
  });
});
