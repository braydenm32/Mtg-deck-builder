import { describe, expect, it } from "vitest";
import { comboTurn, estimateBracket, isExtraTurn, isMassLandDenial } from "@/lib/deck/bracket";
import { findCombos, KNOWN_TWO_CARD_COMBOS, nearCombos } from "@/lib/deck/combos";
import { card, deck } from "./deck-fixtures";

const B = ["Plains", "Island", "Swamp", "Mountain", "Forest"];
const kenrith = (cards: string[]) => deck(["Kenrith, the Returned King"], cards, { basics: B });

describe("detectors", () => {
  it.each(["Armageddon", "Ravages of War", "Jokulhaups", "Obliterate", "Sunder", "Ruination", "Winter Orb", "Blood Moon", "Back to Basics", "Magus of the Moon"])(
    "%s is mass land denial",
    (n) => expect(isMassLandDenial(card(n))).toBe(true),
  );
  // Scourglass spares lands; Stormtide Leviathan adds a land type; From the Ashes replaces the lands.
  it.each(["Strip Mine", "Wrath of God", "Farewell", "Cultivate", "Evacuation", "Forest", "Bojuka Bog", "Scourglass", "Stormtide Leviathan", "From the Ashes"])("%s is not", (n) =>
    expect(isMassLandDenial(card(n))).toBe(false),
  );
  it.each(["Time Warp", "Temporal Manipulation", "Nexus of Fate", "Expropriate", "Time Stretch", "Emrakul, the Aeons Torn"])(
    "%s gives extra turns",
    (n) => expect(isExtraTurn(card(n))).toBe(true),
  );
  it("Seedborn Muse is not an extra turn", () => expect(isExtraTurn(card("Seedborn Muse"))).toBe(false));

  it("combo timing", () => {
    expect(comboTurn(card("Thassa's Oracle"), card("Demonic Consultation"))).toBe(2);
    expect(comboTurn(card("Heliod, Sun-Crowned"), card("Walking Ballista"))).toBe(3);
    expect(comboTurn(card("Exquisite Blood"), card("Sanguine Bond"))).toBe(6);
    expect(comboTurn(card("Kiki-Jiki, Mirror Breaker"), card("Zealous Conscripts"))).toBe(6);
  });

  it("finds whole and nearly-whole combos", () => {
    expect(findCombos(["Thassa's Oracle", "Demonic Consultation", "Sol Ring"]).map((c) => c.cards)).toEqual([["Thassa's Oracle", "Demonic Consultation"]]);
    const near = nearCombos(["Thassa's Oracle"]);
    expect(near.map((n) => n.missing).sort()).toEqual(["Demonic Consultation", "Tainted Pact"]);
    expect(new Set(KNOWN_TWO_CARD_COMBOS.map((c) => c.cards.join("+"))).size).toBe(KNOWN_TWO_CARD_COMBOS.length);
  });
});

describe("estimateBracket", () => {
  it("a clean deck is Bracket 2, and could be 1", () => {
    const r = estimateBracket(kenrith(["Sol Ring", "Cultivate", "Swords to Plowshares", "Wrath of God"]));
    expect(r.bracket).toBe(2);
    expect(r.name).toBe("Core");
    expect(r.couldBeExhibition).toBe(true);
    expect(r.reasons).toEqual([]);
    expect(r.summary).toMatch(/Bracket 1/);
  });

  it("Sol Ring is not a Game Changer; 1 to 3 Game Changers is Bracket 3; 4+ is Bracket 4", () => {
    expect(estimateBracket(kenrith(["Sol Ring"])).bracket).toBe(2);
    const three = estimateBracket(kenrith(["Rhystic Study", "Demonic Tutor", "Smothering Tithe"]));
    expect(three.bracket).toBe(3);
    expect(three.gameChangers).toHaveLength(3);
    const four = estimateBracket(kenrith(["Rhystic Study", "Demonic Tutor", "Smothering Tithe", "Cyclonic Rift"]));
    expect(four.bracket).toBe(4);
    expect(four.reasons[0]).toMatchObject({ code: "game-changers", floor: 4 });
  });

  it("counts Game Changers in the command zone", () => {
    const r = estimateBracket(deck(["Thrasios, Triton Hero", "Tymna the Weaver"], [], { basics: ["Island"] }));
    expect(r.gameChangers).toEqual([]);
  });

  it("mass land denial is Bracket 4", () => {
    const r = estimateBracket(kenrith(["Armageddon"]));
    expect(r.bracket).toBe(4);
    expect(r.massLandDenial).toEqual(["Armageddon"]);
  });

  it("a couple of extra turns rule out Bracket 1 only; three or more look like chaining", () => {
    const two = estimateBracket(kenrith(["Time Warp", "Temporal Manipulation"]));
    expect(two.bracket).toBe(2);
    expect(two.couldBeExhibition).toBe(false);
    const three = estimateBracket(kenrith(["Time Warp", "Temporal Manipulation", "Nexus of Fate"]));
    expect(three.bracket).toBe(4);
    expect(three.reasons[0].code).toBe("extra-turns-chain");
  });

  it("early two-card combos are Bracket 4, late ones Bracket 3", () => {
    const early = estimateBracket(kenrith(["Thassa's Oracle", "Demonic Consultation"]));
    expect(early.bracket).toBe(4);
    expect(early.combos[0]).toMatchObject({ early: true, earliestTurn: 2 });
    // Thassa's Oracle is a Game Changer too, so check the combo reason directly.
    expect(early.reasons.some((r) => r.code === "combo-early")).toBe(true);

    const late = estimateBracket(kenrith(["Exquisite Blood", "Sanguine Bond"]));
    expect(late.bracket).toBe(3);
    expect(late.reasons[0]).toMatchObject({ code: "combo-late", floor: 3 });
    expect(late.summary).toMatch(/Bracket 3/);
  });

  it("takes combos from another source", () => {
    const custom = [{ cards: ["Sol Ring", "Arcane Signet"] as [string, string], result: "test" }];
    const r = estimateBracket(kenrith(["Sol Ring", "Arcane Signet"]), { combos: custom });
    expect(r.combos).toHaveLength(1);
    expect(r.bracket).toBe(4);
  });

  it("ignores the maybeboard", () => {
    const r = estimateBracket([...kenrith([]), { card: card("Armageddon"), quantity: 1, board: "maybe" }]);
    expect(r.bracket).toBe(2);
  });
});
