import { describe, expect, it } from "vitest";
import { boardReducer, commanderTax, deal, deckKey, findCard, type Board, type BoardAction } from "@/lib/deck/board";

const cards = [
  { name: "Forest", image: null, land: true, quantity: 30 },
  { name: "Llanowar Elves", image: null, land: false, quantity: 1 },
  ...Array.from({ length: 68 }, (_, i) => ({ name: `Spell ${i}`, image: null, land: false, quantity: 1 })),
];
const cmdr = [{ name: "Leader", image: null }];
const run = (b: Board, ...as: BoardAction[]) => as.reduce(boardReducer, b);

describe("playtest board", () => {
  it("deals seven, with the commander in the command zone", () => {
    const b = deal("k", cards, cmdr, 3);
    expect(b.zones.hand).toHaveLength(7);
    expect(b.zones.library).toHaveLength(92);
    expect(b.zones.command.map((c) => c.name)).toEqual(["Leader"]);
    // The same seed deals the same game.
    expect(deal("k", cards, cmdr, 3).zones.hand.map((c) => c.name)).toEqual(b.zones.hand.map((c) => c.name));
  });

  it("runs turns: untap and draw", () => {
    let b = deal("k", cards, cmdr, 1);
    const land = b.zones.hand.find((c) => c.land) ?? b.zones.hand[0];
    b = run(b, { type: "move", uid: land.uid, to: "battlefield" }, { type: "tap", uid: land.uid });
    expect(findCard(b, land.uid)).toMatchObject({ zone: "battlefield", card: { tapped: true } });
    b = run(b, { type: "next-turn" });
    expect(b.turn).toBe(2);
    expect(b.zones.hand).toHaveLength(7);
    expect(b.zones.library).toHaveLength(91);
    expect(findCard(b, land.uid)?.card.tapped).toBe(false);
    expect(b.log[0]).toBe("Turn 2: untapped and drew.");
  });

  it("mulligans with the first one free, and keeps the deck whole", () => {
    let b = run(deal("k", cards, cmdr, 2), { type: "mulligan" });
    expect(b.log[0]).toBe("Mulligan: the first one is free.");
    b = run(b, { type: "mulligan" });
    expect(b.log[0]).toBe("Mulligan 2: put 1 card from your hand on the bottom.");
    const bottom = b.zones.hand[0];
    b = run(b, { type: "move", uid: bottom.uid, to: "library", bottom: true });
    expect(b.zones.library.at(-1)?.uid).toBe(bottom.uid);
    expect(b.zones.hand.length + b.zones.library.length).toBe(99);
  });

  it("counts the commander tax, counters, and tokens that vanish", () => {
    let b = deal("k", cards, cmdr, 4);
    const leader = b.zones.command[0];
    b = run(b, { type: "move", uid: leader.uid, to: "battlefield" }, { type: "move", uid: leader.uid, to: "command" }, { type: "move", uid: leader.uid, to: "battlefield" });
    expect(commanderTax(b, "Leader")).toBe(4);
    b = run(b, { type: "counter", uid: leader.uid, by: 2 }, { type: "counter", uid: leader.uid, by: -1 });
    expect(findCard(b, leader.uid)?.card.counters).toBe(1);
    b = run(b, { type: "copy", uid: leader.uid }, { type: "token", name: "Treasure", image: null });
    const made = b.zones.battlefield.filter((c) => c.token);
    expect(made.map((c) => c.name)).toEqual(["Leader", "Treasure"]);
    b = run(b, { type: "move", uid: made[1].uid, to: "graveyard" });
    expect(b.zones.graveyard).toHaveLength(0);
    expect(b.zones.battlefield.some((c) => c.name === "Treasure")).toBe(false);
  });

  it("deals afresh when the deck changes", () => {
    expect(deckKey(1, cards, cmdr)).toBe(deckKey(1, [...cards].reverse(), cmdr));
    expect(deckKey(1, cards, cmdr)).not.toBe(deckKey(1, cards.slice(1), cmdr));
  });
});
