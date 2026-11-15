import { describe, expect, it } from "vitest";
import { analyzeDeck } from "@/lib/deck/analyze";
import { deck } from "./deck-fixtures";

describe("analyzeDeck", () => {
  it("puts legality first, then bracket, then tuning", () => {
    const d = deck(["Korvold, Fae-Cursed King"], ["Swords to Plowshares", "Rhystic Study", "Demonic Tutor", "Armageddon"], { basics: ["Swamp", "Mountain", "Forest"] });
    const a = analyzeDeck(d, { targetBracket: 2 });
    expect(a.validation.legal).toBe(false);
    expect(a.advice[0]).toMatchObject({ priority: 1, kind: "legality" });
    const bracket = a.advice.find((x) => x.kind === "bracket")!;
    expect(bracket.priority).toBe(1);
    expect(bracket.message).toMatch(/Bracket 4.*above your target of 2/);
    expect(bracket.cards).toContain("Armageddon");
    const priorities = a.advice.map((x) => x.priority);
    expect([...priorities].sort()).toEqual(priorities);
  });

  it("aims for Bracket 3 unless told otherwise", () => {
    const d = deck(["Kenrith, the Returned King"], ["Armageddon"], { basics: ["Plains", "Island", "Swamp", "Mountain", "Forest"] });
    expect(analyzeDeck(d).advice.find((x) => x.kind === "bracket")?.message).toMatch(/above your target of 3 \(Upgraded\)/);
    expect(analyzeDeck(d, { targetBracket: 4 }).advice.some((x) => x.kind === "bracket")).toBe(false);
    expect(analyzeDeck(d, { targetBracket: null }).advice.some((x) => x.kind === "bracket")).toBe(false);
    const clean = deck(["Kenrith, the Returned King"], ["Sol Ring"], { basics: ["Plains", "Island", "Swamp", "Mountain", "Forest"] });
    expect(analyzeDeck(clean).advice.some((x) => x.kind === "bracket")).toBe(false);
  });

  it("asks for ramp, draw and removal in a pile of lands", () => {
    const a = analyzeDeck(deck(["Korvold, Fae-Cursed King"], [], { basics: ["Swamp", "Mountain", "Forest"] }));
    const roles = a.advice.filter((x) => x.kind === "roles").map((x) => x.message);
    expect(roles.some((m) => /^Ramp: 0/.test(m))).toBe(true);
    expect(roles.some((m) => /^Removal: 0/.test(m))).toBe(true);
    expect(a.advice.some((x) => x.kind === "lands" && /cut/.test(x.message))).toBe(true);
  });

  it("flags thin colour sources for demanding cards", () => {
    // 1 Plains in a deck of Swamps, with a WW card.
    const d = deck(["Tymna the Weaver"], { "Wrath of God": 1, Plains: 1 }, { basics: ["Swamp"] });
    const colors = analyzeDeck(d).advice.filter((x) => x.kind === "colors");
    expect(colors[0].message).toMatch(/More white sources: Wrath of God needs 2 white by turn 4/);
  });

  it("skips tuning advice on a half-built deck", () => {
    const a = analyzeDeck(deck(["Korvold, Fae-Cursed King"], ["Sol Ring"], { basics: ["Swamp"], size: 40 }));
    expect(a.advice.every((x) => x.kind === "legality")).toBe(true);
  });
});
