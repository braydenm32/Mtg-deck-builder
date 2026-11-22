import { describe, expect, it } from "vitest";
import { tokensOf } from "@/lib/cards/rows";
import { buyListText, STORES, storesFor } from "@/lib/deck/buy";

describe("tokensOf", () => {
  it("keeps tokens once each, not the card itself or other parts", () => {
    const c = {
      id: "self",
      name: "Krenko, Mob Boss",
      all_parts: [
        { id: "self", component: "combo_piece", name: "Krenko, Mob Boss" },
        { id: "g1", component: "token", name: "Goblin" },
        { id: "g2", component: "token", name: "Goblin" },
        { id: "m1", component: "meld_part", name: "Other" },
        { id: "t1", component: "token", name: "Treasure" },
      ],
    };
    expect(tokensOf(c)).toEqual([
      { id: "g1", name: "Goblin" },
      { id: "t1", name: "Treasure" },
    ]);
  });
  it("is empty for a card that makes nothing", () => {
    expect(tokensOf({ id: "x", name: "Sol Ring" })).toEqual([]);
  });
});

describe("buy list", () => {
  const lines = [
    { name: "Sol Ring", quantity: 1 },
    { name: "Brazen Borrower // Petty Theft", quantity: 1 },
  ];
  it("writes one line per card with the front face name", () => {
    expect(buyListText(lines)).toBe("1 Sol Ring\n1 Brazen Borrower");
  });
  it("fills TCGplayer's Mass Entry link", () => {
    const url = STORES.find((s) => s.id === "tcgplayer")!.url(lines);
    expect(decodeURIComponent(url.split("c=")[1])).toBe("1 Sol Ring||1 Brazen Borrower");
  });
  it("puts Australian stores first for AUD", () => {
    expect(storesFor("AUD")[0].where).toBe("AU");
    expect(storesFor("USD")[0].where).toBe("US");
  });
});
