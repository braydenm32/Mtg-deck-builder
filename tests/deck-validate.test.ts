import { describe, expect, it } from "vitest";
import { copyLimit, pairProblem, validateDeck } from "@/lib/deck/validate";
import { card, deck, entries } from "./deck-fixtures";

const codes = (r: ReturnType<typeof validateDeck>) => r.issues.map((i) => i.code);

describe("validateDeck", () => {
  it("accepts a legal 100-card deck", () => {
    const r = validateDeck(deck(["Atraxa, Praetors' Voice"], ["Sol Ring", "Swords to Plowshares", "Cultivate", "Counterspell"], { basics: ["Plains", "Island", "Swamp", "Forest"] }));
    expect(r.issues).toEqual([]);
    expect(r.legal).toBe(true);
    expect(r.deckSize).toBe(100);
    expect(r.colorIdentity).toBe("WUBG");
    expect(r.commanders).toEqual(["Atraxa, Praetors' Voice"]);
  });

  it("needs a commander", () => {
    const r = validateDeck(entries({ Forest: 100 }));
    expect(codes(r)).toContain("no-commander");
    expect(r.legal).toBe(false);
  });

  it("counts the commander towards 100 and says how many to add or cut", () => {
    const short = validateDeck(deck(["Korvold, Fae-Cursed King"], [], { basics: ["Swamp"], size: 98 }));
    expect(short.issues.find((i) => i.code === "deck-size")?.message).toMatch(/98 cards.*add 2/);
    const long = validateDeck(deck(["Korvold, Fae-Cursed King"], [], { basics: ["Swamp"], size: 101 }));
    expect(long.issues.find((i) => i.code === "deck-size")?.message).toMatch(/cut 1/);
  });

  it("enforces singleton, except basics and cards that say otherwise", () => {
    expect(copyLimit(card("Forest"))).toBe(Infinity);
    expect(copyLimit(card("Snow-Covered Island"))).toBe(Infinity);
    expect(copyLimit(card("Wastes"))).toBe(Infinity);
    expect(copyLimit(card("Relentless Rats"))).toBe(Infinity);
    expect(copyLimit(card("Persistent Petitioners"))).toBe(Infinity);
    expect(copyLimit(card("Seven Dwarves"))).toBe(7);
    expect(copyLimit(card("Nazgûl"))).toBe(9);
    expect(copyLimit(card("Sol Ring"))).toBe(1);
    expect(copyLimit(card("Command Tower"))).toBe(1);

    const r = validateDeck(deck(["Korvold, Fae-Cursed King"], { "Sol Ring": 2, "Relentless Rats": 20, "Seven Dwarves": 8 }, { basics: ["Swamp"] }));
    const dupes = r.issues.filter((i) => i.code === "duplicate");
    expect(dupes.flatMap((i) => i.cards).sort()).toEqual(["Seven Dwarves", "Sol Ring"]);
  });

  it("checks colour identity against the commander", () => {
    const r = validateDeck(deck(["Korvold, Fae-Cursed King"], ["Swords to Plowshares", "Counterspell", "Sol Ring"], { basics: ["Swamp"] }));
    expect(r.issues.find((i) => i.code === "color-identity")?.cards).toEqual(["Swords to Plowshares", "Counterspell"]);
  });

  it("flags banned cards from Scryfall's legality, including commanders", () => {
    const r = validateDeck(deck(["Golos, Tireless Pilgrim"], ["Mana Crypt", "Jeweled Lotus", "Sol Ring"], { basics: ["Wastes"] }));
    expect(r.issues.find((i) => i.code === "banned")?.cards.sort()).toEqual(["Golos, Tireless Pilgrim", "Jeweled Lotus", "Mana Crypt"]);
  });

  it("rejects commanders that can't command", () => {
    const r = validateDeck(deck(["Sol Ring"], [], { basics: ["Wastes"] }));
    expect(codes(r)).toContain("not-a-commander");
    expect(validateDeck(deck(["Grist, the Hunger Tide"], [], { basics: ["Forest"] })).legal).toBe(true);
    expect(validateDeck(deck(["Teferi, Temporal Archmage"], [], { basics: ["Island"] })).legal).toBe(true);
  });

  it("allows at most two commanders", () => {
    const r = validateDeck(deck(["Thrasios, Triton Hero", "Tymna the Weaver", "Kraum, Ludevic's Opus"], [], { basics: ["Island"] }));
    expect(codes(r)).toContain("too-many-commanders");
  });

  describe("two commanders", () => {
    const ok = (a: string, b: string) => expect(pairProblem(card(a), card(b))).toBeUndefined();
    const bad = (a: string, b: string) => expect(pairProblem(card(a), card(b))).toBeTypeOf("string");

    it("Partner pairs with any Partner", () => {
      ok("Thrasios, Triton Hero", "Tymna the Weaver");
      ok("Kraum, Ludevic's Opus", "Rograkh, Son of Rohgahh");
    });
    it("Partner with pairs only with its named partner", () => {
      ok("Pir, Imaginative Rascal", "Toothy, Imaginary Friend");
      ok("Toothy, Imaginary Friend", "Pir, Imaginative Rascal");
      bad("Pir, Imaginative Rascal", "Thrasios, Triton Hero");
      expect(pairProblem(card("Pir, Imaginative Rascal"), card("Tymna the Weaver"))).toMatch(/only partner with Toothy/);
    });
    it("Choose a Background pairs with a Background", () => {
      ok("Karlach, Fury of Avernus", "Raised by Giants");
      ok("Raised by Giants", "Wilson, Refined Grizzly");
      bad("Karlach, Fury of Avernus", "Thrasios, Triton Hero");
    });
    it("Doctor's companion pairs with a Doctor", () => {
      ok("Clara Oswald", "The Fourteenth Doctor");
      bad("Clara Oswald", "Atraxa, Praetors' Voice");
    });
    it("other legends can't pair", () => {
      bad("Atraxa, Praetors' Voice", "Korvold, Fae-Cursed King");
    });

    it("combines both colour identities", () => {
      const r = validateDeck(deck(["Thrasios, Triton Hero", "Tymna the Weaver"], ["Swords to Plowshares", "Counterspell", "Cultivate"], { basics: ["Island"] }));
      expect(r.colorIdentity).toBe("WUBG");
      expect(r.legal).toBe(true);
    });

    it("a Background alone isn't a commander", () => {
      const r = validateDeck(deck(["Raised by Giants"], [], { basics: ["Forest"] }));
      expect(r.issues.find((i) => i.code === "not-a-commander")?.message).toMatch(/Choose a Background/);
      expect(validateDeck(deck(["Wilson, Refined Grizzly", "Raised by Giants"], [], { basics: ["Forest"] })).legal).toBe(true);
    });
  });

  describe("companions", () => {
    const withCompanion = (name: string, cards: string[], commanders = ["Atraxa, Praetors' Voice"]) => [
      ...deck(commanders, cards, { basics: ["Plains", "Island", "Swamp", "Forest"] }),
      ...entries([name], "companion"),
    ];

    it("don't count towards 100", () => {
      const r = validateDeck(withCompanion("Lurrus of the Dream-Den", ["Sol Ring"], ["Tymna the Weaver"]));
      expect(r.deckSize).toBe(100);
    });

    it("Lurrus: permanents with mana value 3+ break the condition (commander included)", () => {
      const r = validateDeck(withCompanion("Lurrus of the Dream-Den", ["Sol Ring", "Cultivate", "Eternal Witness"], ["Tymna the Weaver", "Thrasios, Triton Hero"]));
      expect(r.issues.find((i) => i.code === "companion-restriction")?.cards).toEqual(["Tymna the Weaver", "Eternal Witness"]);
    });

    it("Yorion can't be met in Commander, Lutri is banned as a companion", () => {
      expect(codes(validateDeck(withCompanion("Yorion, Sky Nomad", [])))).toContain("companion-restriction");
      const lutri = validateDeck(withCompanion("Lutri, the Spellchaser", [], ["Korvold, Fae-Cursed King"]));
      expect(lutri.issues.find((i) => i.code === "companion-invalid")?.message).toMatch(/banned as a companion/);
    });

    it("rejects non-companions and off-colour companions", () => {
      expect(codes(validateDeck(withCompanion("Sol Ring", [])))).toContain("companion-invalid");
      const r = validateDeck(withCompanion("Lurrus of the Dream-Den", [], ["Korvold, Fae-Cursed King"]));
      expect(r.issues.some((i) => i.code === "companion-invalid" && /colour identity/.test(i.message))).toBe(true);
    });
  });

  it("ignores the maybeboard and sideboard", () => {
    const r = validateDeck([...deck(["Korvold, Fae-Cursed King"], [], { basics: ["Swamp"] }), ...entries(["Swords to Plowshares"], "maybe")]);
    expect(r.legal).toBe(true);
  });
});
