import { describe, expect, it } from "vitest";
import { adviceAction, artCrop, deckIdentity, nextStep, OPEN_ORDER, slotCounts, someNames } from "@/components/deck/slots";
import type { SlotState } from "@/lib/deck/store";

type Board = "main" | "maybe" | "wanted" | "upgrade";
const row = (name: string, state: SlotState, board: Board = "main", quantity = 1) => ({ name, state, board, quantity });
const deck = (status: "idea" | "building" | "built" | "retired", cards: ReturnType<typeof row>[]) => ({ deck: { id: 7, status }, cards });

describe("slotCounts", () => {
  it("adds up quantities by state for the main deck only", () => {
    const c = slotCounts([row("Forest", "placed", "main", 12), row("Sol Ring", "shared"), row("Swiftfoot Boots", "shared"), row("Arid Mesa", "not-owned"), row("Zuran Orb", "free", "maybe"), row("Harrow", "other-deck", "wanted")]);
    expect(c).toEqual({ placed: 12, free: 0, shared: 2, "other-deck": 0, "not-owned": 1, "no-data": 0 });
  });

  it("orders open slots owned first", () => {
    expect(OPEN_ORDER).toEqual(["free", "shared", "other-deck", "not-owned", "no-data"]);
  });
});

describe("someNames", () => {
  it("lists a few names and counts the rest", () => {
    expect(someNames([{ name: "A" }])).toBe("A");
    expect(someNames([{ name: "A" }, { name: "B" }])).toBe("A and B");
    expect(someNames([{ name: "A" }, { name: "B" }, { name: "C" }])).toBe("A, B and C");
    expect(someNames(["A", "B", "C", "D", "E", "F"].map((name) => ({ name })))).toBe("A, B, C and 3 more");
  });
});

describe("nextStep", () => {
  it("builds an empty deck first", () => {
    expect(nextStep(deck("idea", [])).action).toEqual({ label: "Build the deck", run: "rebuild" });
  });

  it("starts building an idea, and offers a quiet rebuild for a retired deck", () => {
    expect(nextStep(deck("idea", [row("Sol Ring", "free")])).action).toEqual({ label: "Start building", run: "build" });
    expect(nextStep(deck("retired", [row("Sol Ring", "free")])).tone).toBe("quiet");
  });

  it("fills open slots owned first: free, shared, other decks, then to buy", () => {
    const all = [row("Arid Mesa", "not-owned"), row("Harrow", "other-deck"), row("Sol Ring", "shared"), row("Zuran Orb", "free"), row("Forest", "placed")];
    expect(nextStep(deck("building", all)).title).toBe("Place your free copies");
    expect(nextStep(deck("building", all.filter((r) => r.state !== "free"))).action).toEqual({ label: "Decide", href: "/decks/shared" });
    expect(nextStep(deck("building", all.filter((r) => !["free", "shared"].includes(r.state)))).detail).toBe("Every copy of Harrow is in another deck.");
    expect(nextStep(deck("building", [row("Arid Mesa", "not-owned")])).action).toEqual({ label: "See the list", href: "/decks/7/missing" });
  });

  it("ignores the maybeboard and suggestions when deciding", () => {
    expect(nextStep(deck("built", [row("Forest", "placed"), row("Arid Mesa", "not-owned", "maybe"), row("Harrow", "other-deck", "wanted")])).tone).toBe("done");
  });

  it("points at the To do list when the 100 is in hand but something must be fixed", () => {
    expect(nextStep(deck("building", [row("Forest", "placed")]), { mustFix: 1 }).action).toEqual({ label: "See To do", href: "#todo" });
    expect(nextStep(deck("building", [row("Forest", "placed")])).action).toEqual({ label: "Playtest", href: "/decks/7/playtest" });
  });
});

describe("adviceAction", () => {
  it("sends each kind of advice where you'd fix it", () => {
    expect(adviceAction("roles", 3).href).toBe("/decks/3/suggestions");
    expect(adviceAction("lands", 3).href).toBe("/decks/3/cards?group=type");
    expect(adviceAction("bracket", 3).href).toBe("#bracket");
  });
});

describe("artCrop", () => {
  it("swaps a Scryfall image size for the art crop, and leaves anything else alone", () => {
    expect(artCrop("https://cards.scryfall.io/normal/front/7/0/70b6.jpg?1783904920")).toBe("https://cards.scryfall.io/art_crop/front/7/0/70b6.jpg?1783904920");
    expect(artCrop("https://cards.scryfall.io/png/front/7/0/70b6.png")).toBe("https://cards.scryfall.io/png/front/7/0/70b6.png");
    expect(artCrop("https://example.com/a.jpg")).toBe("https://example.com/a.jpg");
    expect(artCrop(null)).toBeNull();
  });
});

describe("deckIdentity", () => {
  it("uses the deck's identity, or its commanders' in WUBRG order when the deck has none", () => {
    expect(deckIdentity("RG", [{ colorIdentity: "WRG" }])).toBe("RG");
    expect(deckIdentity("", [{ colorIdentity: "GW" }, { colorIdentity: "R" }])).toBe("WRG");
    expect(deckIdentity("", [{ colorIdentity: "" }])).toBe("");
  });
});
