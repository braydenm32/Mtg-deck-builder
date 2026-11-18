import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { cardFacts, MECHANICS, typalMechanic } from "@/lib/deck/mechanics";
import { deckSynergy, synergyContext, synergyLabel } from "@/lib/deck/synergy";
import type { DeckCardInput, DeckEntry } from "@/lib/deck/types";
import { card as fixtureCard } from "./deck-fixtures";

type Fixture = { decks: Record<string, { commander: string[]; cards: [string, number][] }>; cards: Record<string, DeckCardInput> };
const FIX = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", "synergy-decks.json"), "utf8")) as Fixture;
const card = (name: string) => {
  const c = FIX.cards[name];
  if (!c) throw new Error(`no ${name} in synergy-decks.json`);
  return c;
};
const deck = (key: string): DeckEntry[] => {
  const d = FIX.decks[key];
  return [
    ...d.commander.map((n) => ({ card: card(n), quantity: 1, board: "commander" as const })),
    ...d.cards.filter(([n]) => FIX.cards[n]).map(([n, q]) => ({ card: card(n), quantity: q, board: "main" as const })),
  ];
};
const side = (mechanic: string, name: string, from: (n: string) => DeckCardInput = card) => MECHANICS.find((m) => m.id === mechanic)!.side(cardFacts(from(name)));

describe("mechanics", () => {
  it("reads enablers and payoffs from rules text", () => {
    expect(side("sacrifice", "Viscera Seer").enabler).toBe(1);
    expect(side("sacrifice", "Blood Artist").payoff).toBe(1);
    expect(side("counters", "Hardened Scales").payoff).toBe(1);
    expect(side("tokens", "Doubling Season").payoff).toBe(1);
    expect(side("spells", "Talrand, Sky Summoner").payoff).toBe(1);
    expect(side("graveyard", "Meren of Clan Nel Toth").payoff).toBe(1);
    expect(side("landfall", "Cultivate")).toEqual({ enabler: 0.8, payoff: 0 });
    // Older cards say their name, newer ones "this creature": both read as the card itself.
    expect(side("sacrifice", "Zulaport Cutthroat", fixtureCard).payoff).toBe(1);
  });

  it("reads typal cards: the type, lords that name it, and not 'non-Goblin'", () => {
    const goblins = typalMechanic("Goblin");
    expect(goblins.side(cardFacts(card("Goblin Chieftain")))).toEqual({ enabler: 1, payoff: 1 });
    expect(goblins.side(cardFacts(card("Krenko, Mob Boss"))).payoff).toBe(1);
    const humans = typalMechanic("Human");
    expect(humans.side(cardFacts({ ...fixtureCard("Grizzly Bears"), oracleText: "Whenever a non-Human creature you control dies, draw a card." })).payoff).toBe(0);
  });
});

describe("deck synergy", () => {
  const krenko = deckSynergy(deck("krenko"));

  it("scores a focused deck high and lists its mechanics", () => {
    expect(krenko.score).toBeGreaterThanOrEqual(80);
    const labels = krenko.mechanics.map((m) => m.label);
    expect(labels).toContain("Goblins");
    expect(labels).toContain("Tokens");
    const goblins = krenko.mechanics.find((m) => m.label === "Goblins")!;
    expect(goblins.commander).toBe(true);
    expect(goblins.cards[0]).toBe("Krenko, Mob Boss");
    expect(krenko.mechanics.length).toBeLessThanOrEqual(6);
    expect(synergyLabel(krenko.score)).toBe(krenko.label);
  });

  it("scores a pile of good cards with no shared plan low", () => {
    const staples = ["Sol Ring", "Arcane Signet", "Mind Stone", "Fellwar Stone", "Lightning Bolt", "Chaos Warp", "Blasphemous Act", "Faithless Looting", "Jeska's Will", "Light Up the Stage", "Chain Lightning", "Deflecting Swat", "Zealous Conscripts", "Kiki-Jiki, Mirror Breaker", "Grizzly Bears", "Wood Elves", "Craterhoof Behemoth", "Ancient Tomb", "Command Tower"];
    const pile: DeckEntry[] = [{ card: card("Krenko, Mob Boss"), quantity: 1, board: "commander" }, ...staples.map((n) => ({ card: fixtureCard(n), quantity: 1, board: "main" as const })), { card: fixtureCard("Mountain"), quantity: 30, board: "main" }];
    const r = deckSynergy(pile);
    expect(r.score).toBeLessThan(45);
    expect(r.score).toBeLessThan(krenko.score - 30);
    expect(r.basics).toBe(30);
    // Staples keep their place; the rest that don't fit are the cuts.
    expect(r.cards.find((c) => c.name === "Sol Ring")).toMatchObject({ staple: "Ramp", cut: false });
    expect(r.cards.find((c) => c.name === "Grizzly Bears")).toMatchObject({ cut: true });
  });

  it("ranks every spell and nonbasic land, best first, with a reason", () => {
    expect(krenko.cards.length).toBeGreaterThan(50);
    for (let i = 1; i < krenko.cards.length; i++) expect(krenko.cards[i - 1].score).toBeGreaterThanOrEqual(krenko.cards[i].score);
    expect(krenko.cards.every((c) => c.reason.length > 0 && c.score >= 0 && c.score <= 100)).toBe(true);
    expect(krenko.lands.length).toBeGreaterThan(0);
    expect(krenko.lands.every((l) => l.land)).toBe(true);
    expect(krenko.cards.some((c) => c.name === "Krenko, Mob Boss")).toBe(false);
    const cuts = krenko.cards.filter((c) => c.cut);
    expect(cuts.length).toBeLessThanOrEqual(8);
    expect(cuts.every((c) => !c.staple && c.score < 35)).toBe(true);
  });

  it("explains a card in words", () => {
    const top = krenko.cards[0];
    expect(top.score).toBeGreaterThanOrEqual(80);
    expect(top.reason).toMatch(/Goblins|Tokens/);
    expect(top.reason).toMatch(/works with Krenko/);
  });

  it("always lists the deck's chosen theme", () => {
    const r = deckSynergy(deck("krenko"), { theme: "lifegain" });
    const theme = r.mechanics.find((m) => m.theme);
    expect(theme?.label).toBe("Lifegain");
  });

  it("adds EDHREC's synergy and combos when given", () => {
    const base = deckSynergy(deck("meren"));
    const withEdh = deckSynergy(deck("meren"), { edhrec: (n) => (n === "Spore Frog" ? 0.7 : undefined) });
    expect(base.hasEdhrec).toBe(false);
    expect(withEdh.hasEdhrec).toBe(true);
    const frog = withEdh.cards.find((c) => c.name === "Spore Frog")!;
    expect(frog.reason).toMatch(/EDHREC synergy \+70%/);
    const combo = deckSynergy(deck("meren"), { combos: [{ cards: ["Spore Frog", "Meren of Clan Nel Toth"], result: "Fog every turn" }] });
    expect(combo.parts.combos).toBe(1);
    expect(combo.cards.find((c) => c.name === "Spore Frog")).toMatchObject({ combo: true, cut: false });
    expect(combo.score).toBeGreaterThan(base.score);
  });

  it("rates a card that isn't in the deck on the same scale", () => {
    const ctx = synergyContext(deck("krenko"));
    expect(ctx.rate(card("Goblin Chieftain")).score).toBeGreaterThanOrEqual(70);
    expect(ctx.rate(card("Goblin Chieftain")).mechanicLabels).toContain("Goblins");
    expect(ctx.rate(card("Pongify")).score).toBeLessThan(30);
  });

  it("handles an empty deck", () => {
    const r = deckSynergy([{ card: card("Krenko, Mob Boss"), quantity: 1, board: "commander" }]);
    expect(r.score).toBe(0);
    expect(r.cards).toEqual([]);
  });
});
