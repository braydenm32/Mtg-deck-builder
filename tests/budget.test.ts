import { describe, expect, it } from "vitest";
import { planBudget } from "@/lib/deck/budget";

describe("budget upgrades", () => {
  it("takes the strongest cards that still fit, skipping unpriced ones", () => {
    const cards = [
      { oracleId: "a", name: "A", priceUsd: 30, score: 9 },
      { oracleId: "b", name: "B", priceUsd: 15, score: 8 },
      { oracleId: "c", name: "C", priceUsd: 10, score: 7 },
      { oracleId: "d", name: "D", priceUsd: null, score: 10 },
      { oracleId: "e", name: "E", priceUsd: 4, score: 1 },
    ];
    const p = planBudget(cards, 30);
    expect(p.picks.map((c) => c.name)).toEqual(["A"]);
    const q = planBudget(cards, 29);
    expect(q.picks.map((c) => c.name)).toEqual(["B", "C", "E"]);
    expect(q.spent).toBe(29);
  });
});
