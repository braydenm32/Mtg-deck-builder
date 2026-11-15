import { describe, expect, it } from "vitest";
import { chooseBottom, defaultKeep, goldfish, libraryCards, openingHand, rng, shuffle, shuffledLibrary } from "@/lib/deck/goldfish";
import { card, deck, entries } from "./deck-fixtures";

const B = ["Plains", "Island", "Swamp", "Forest"];
const atraxa = (lands: number) =>
  deck(
    ["Atraxa, Praetors' Voice"],
    {
      "Sol Ring": 1, "Arcane Signet": 1, Cultivate: 1, "Kodama's Reach": 1, "Rampant Growth": 1, "Fellwar Stone": 1,
      "Mind Stone": 1, "Birds of Paradise": 1, "Llanowar Elves": 1, "Grizzly Bears": 99 - lands - 9,
    },
    { basics: B },
  );

describe("rng and shuffle", () => {
  it("is deterministic per seed and keeps every card", () => {
    const a = shuffle([1, 2, 3, 4, 5, 6, 7, 8], rng(42));
    const b = shuffle([1, 2, 3, 4, 5, 6, 7, 8], rng(42));
    expect(a).toEqual(b);
    expect([...a].sort()).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(shuffle([1, 2, 3, 4, 5, 6, 7, 8], rng(7))).not.toEqual(a);
    const r = rng(1);
    for (let i = 0; i < 100; i++) {
      const x = r();
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });

  it("the library is the 99 (commander stays in the command zone)", () => {
    expect(libraryCards(atraxa(37))).toHaveLength(99);
    expect(shuffledLibrary(atraxa(37), 3)).toHaveLength(99);
    expect(shuffledLibrary(atraxa(37), 3).some((c) => c.name.startsWith("Atraxa"))).toBe(false);
  });
});

describe("mulligans", () => {
  it("keeps 2 to 5 lands", () => {
    const hand = (lands: number) => [...Array(lands).fill(card("Forest")), ...Array(7 - lands).fill(card("Grizzly Bears"))];
    expect(defaultKeep(hand(1), 0)).toBe(false);
    expect(defaultKeep(hand(2), 0)).toBe(true);
    expect(defaultKeep(hand(5), 0)).toBe(true);
    expect(defaultKeep(hand(6), 0)).toBe(false);
    expect(defaultKeep(hand(0), 3)).toBe(true);
  });

  it("bottoms expensive spells, or lands beyond four", () => {
    const hand = [card("Forest"), card("Forest"), card("Craterhoof Behemoth"), card("Sol Ring"), card("Grizzly Bears"), card("Cultivate"), card("Island")];
    expect(chooseBottom(hand, 2).map((c) => c.name)).toEqual(["Craterhoof Behemoth", "Cultivate"]);
    const floody = [...Array(6).fill(card("Forest")), card("Sol Ring")];
    expect(chooseBottom(floody, 1).map((c) => c.name)).toEqual(["Forest"]);
  });

  it("the first mulligan is free in multiplayer, then the London mulligan bottoms one per mulligan", () => {
    // A library with no lands never makes a keepable hand until the rule gives up at 3 mulligans.
    const noLands = libraryCards(entries({ "Grizzly Bears": 99 }));
    const multi = openingHand(noLands, rng(1));
    expect(multi.mulligans).toBe(3);
    expect(multi.hand).toHaveLength(5); // 3 mulligans, first free: bottom 2
    expect(multi.library).toHaveLength(94);
    const duel = openingHand(noLands, rng(1), { freeMulligan: false });
    expect(duel.hand).toHaveLength(4);
  });
});

describe("goldfish", () => {
  it("more lands means fewer missed land drops", () => {
    const light = goldfish(atraxa(30), { games: 1500, seed: 5 });
    const normal = goldfish(atraxa(37), { games: 1500, seed: 5 });
    expect(normal.landDropsHit[4]).toBeGreaterThan(light.landDropsHit[4]);
    expect(normal.averageLandsInOpeningHand).toBeGreaterThan(light.averageLandsInOpeningHand);
    expect(normal.mulliganRate).toBeGreaterThan(0);
    expect(normal.mulliganRate).toBeLessThan(0.5);
  });

  it("ramp raises available mana and gets the commander out", () => {
    const r = goldfish(atraxa(37), { games: 1500, seed: 9 });
    expect(r.averageMana[4]).toBeGreaterThan(3.3);
    expect(r.averageMana[8]).toBeGreaterThan(r.averageMana[4]);
    expect(r.commanderOnTurn?.manaValue).toBe(4);
    expect(r.commanderOnTurn!.byTurn[8]).toBeGreaterThan(0.9);
    expect(r.commanderOnTurn!.medianTurn).toBeGreaterThanOrEqual(3);
    expect(r.commanderOnTurn!.medianTurn).toBeLessThanOrEqual(5);
  });

  it("is reproducible with a seed", () => {
    expect(goldfish(atraxa(36), { games: 300, seed: 11 })).toEqual(goldfish(atraxa(36), { games: 300, seed: 11 }));
  });
});
