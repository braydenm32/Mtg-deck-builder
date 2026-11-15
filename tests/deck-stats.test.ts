import { describe, expect, it } from "vitest";
import { atLeast, cardsSeen, chanceByTurn, choose, hypergeometric, openingHandLands } from "@/lib/deck/probability";
import { deckStats, producedColors, recommendedLands } from "@/lib/deck/stats";
import { card, deck } from "./deck-fixtures";

describe("probability", () => {
  it("binomials and hypergeometric basics", () => {
    expect(choose(5, 2)).toBe(10);
    expect(choose(99, 7)).toBeCloseTo(14887031544, -2);
    expect(choose(3, 5)).toBe(0);
    const dist = openingHandLands(99, 37);
    expect(dist.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10);
    // 37 lands in 99: about 70% of 7-card hands have 2 to 4 lands.
    expect(dist[2] + dist[3] + dist[4]).toBeGreaterThan(0.68);
    expect(dist[2] + dist[3] + dist[4]).toBeLessThan(0.75);
    expect(hypergeometric(99, 1, 7, 1)).toBeCloseTo(7 / 99, 10);
    expect(atLeast(99, 0, 7, 1)).toBe(0);
    expect(atLeast(99, 10, 7, 0)).toBe(1);
  });

  it("counts cards seen the multiplayer way by default", () => {
    expect(cardsSeen(1)).toBe(8);
    expect(cardsSeen(1, { multiplayer: false })).toBe(7);
    expect(cardsSeen(1, { multiplayer: false, onThePlay: false })).toBe(8);
    expect(cardsSeen(0)).toBe(7);
  });

  it("chance to see a single card", () => {
    // One copy in 99, by turn 3 in multiplayer (10 cards seen): 10/99.
    expect(chanceByTurn({ library: 99, copies: 1, turn: 3 })).toBeCloseTo(10 / 99, 10);
  });
});

describe("deckStats", () => {
  const atraxa = deck(
    ["Atraxa, Praetors' Voice"],
    [
      "Sol Ring", "Arcane Signet", "Cultivate", "Kodama's Reach", "Swords to Plowshares", "Counterspell", "Wrath of God",
      "Rhystic Study", "Demonic Tutor", "Eternal Witness", "Doubling Season", "Hardened Scales", "Command Tower",
      "Overgrown Tomb", "Agadeem's Awakening", "Toxic Deluge", "Craterhoof Behemoth", "Grizzly Bears",
    ],
    { basics: ["Plains", "Island", "Swamp", "Forest"], size: 100 },
  );

  it("totals, lands and types", () => {
    const s = deckStats(atraxa);
    expect(s.totalCards).toBe(100);
    expect(s.commanders).toEqual(["Atraxa, Praetors' Voice"]);
    expect(s.colorIdentity).toBe("WUBG");
    // 81 basics + Command Tower + Overgrown Tomb
    expect(s.lands).toBe(83);
    expect(s.mdfcLands).toBe(1);
    expect(s.nonlands).toBe(16);
    expect(s.types.Land).toBe(83);
    expect(s.types.Creature).toBe(3);
    expect(s.types.Sorcery).toBe(6);
    expect(s.gameChangers.sort()).toEqual(["Demonic Tutor", "Rhystic Study"]);
  });

  it("curve buckets nonland main-deck cards, 7+ grouped", () => {
    const s = deckStats(atraxa);
    expect(s.curve.reduce((n, b) => n + b.count, 0)).toBe(16);
    expect(s.curve[1]).toMatchObject({ count: 3, spells: 1, permanents: 2 }); // Sol Ring, Hardened Scales, Swords
    expect(s.curve[7].count).toBe(1); // Craterhoof
    expect(s.curve[4]).toMatchObject({ count: 1, spells: 1, permanents: 0 }); // Wrath of God
    const nonland = atraxa.filter((e) => e.board === "main" && !/Land/.test(e.card.typeLine.split(" // ")[0]));
    const mv = nonland.reduce((n, e) => n + e.card.cmc * e.quantity, 0) / 16;
    expect(s.averageManaValue).toBeCloseTo(mv, 2);
  });

  it("counts land colour sources, fetch effects and any-colour lands", () => {
    const s = deckStats(atraxa);
    const by = Object.fromEntries(s.colors.map((c) => [c.color, c]));
    // 81 basics (21 Plains, 20 of the rest), Command Tower (any), Overgrown Tomb (B/G), Agadeem's land back (B).
    expect(by.W.landSources).toBe(21 + 1);
    expect(by.U.landSources).toBe(20 + 1);
    expect(by.B.landSources).toBe(20 + 3);
    expect(by.G.landSources).toBe(20 + 2);
    expect(s.colors.map((c) => c.color)).toEqual(["W", "U", "B", "G"]);
    expect(by.W.hardest?.name).toBe("Wrath of God");
    expect(by.W.hardest?.pips).toBe(2);
    expect(by.W.hardest?.chanceOnCurve).toBeGreaterThan(0.5);
    expect(by.U.otherSources).toBeGreaterThanOrEqual(1); // Arcane Signet
    // Atraxa (the commander) has a U pip but isn't counted as the hardest main-deck card.
    expect(by.U.hardest?.name).toBe("Counterspell");
  });

  it("produced colours from text", () => {
    expect([...producedColors(card("Forest"), "WUBRG")]).toEqual(["G"]);
    expect([...producedColors(card("Command Tower"), "BG")].sort()).toEqual(["B", "G"]);
    expect([...producedColors(card("Evolving Wilds"), "UR")].sort()).toEqual(["R", "U"]);
    expect([...producedColors(card("Talisman of Dominance"), "UB")].sort()).toEqual(["B", "C", "U"]);
    expect([...producedColors(card("Sol Ring"), "G")]).toEqual(["C"]);
    expect([...producedColors(card("Overgrown Tomb"), "G")]).toEqual(["G"]);
    expect([...producedColors(card("Birds of Paradise"), "WU")].sort()).toEqual(["U", "W"]);
  });

  it("land advice follows Karsten's formula and says what to do", () => {
    expect(recommendedLands(3, 10)).toBe(Math.round(31.42 + 3.13 * 3 - 2.8));
    expect(recommendedLands(0, 40)).toBe(31);
    expect(recommendedLands(6, 0)).toBe(42);
    const s = deckStats(atraxa);
    expect(s.landAdvice.delta).toBeLessThan(-1);
    expect(s.landAdvice.summary).toMatch(/could cut/);
    expect(s.landAdvice.cheapRampAndDraw).toBe(2); // Sol Ring, Arcane Signet
  });

  it("role checklist flags low counts", () => {
    const s = deckStats(atraxa);
    const line = (r: string) => s.checklist.find((l) => l.role === r)!;
    expect(line("ramp")).toMatchObject({ count: 4, status: "low" });
    expect(line("wipe")).toMatchObject({ count: 2, status: "ok" });
    expect(line("land").status).toBe("ok");
  });

  it("prices only when asked, listing unpriced cards", () => {
    expect(deckStats(atraxa).price).toBeUndefined();
    const s = deckStats(atraxa, { prices: true });
    expect(s.price!.totalUsd).toBeGreaterThan(0);
    expect(s.price!.unpriced).not.toContain("Forest");
  });

  it("opening-hand land odds use the 99-card library", () => {
    const s = deckStats(atraxa);
    expect(s.openingHandLands).toHaveLength(8);
    expect(s.openingHandLands.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 3);
  });
});
