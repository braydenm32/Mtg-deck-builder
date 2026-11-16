import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseSaltList, saltyCards } from "@/lib/edhrec/salt";
import { rule0Summary } from "@/lib/deck/rule0";

const TOP = JSON.parse(readFileSync("tests/fixtures/edhrec/top-salt.json", "utf8"));

describe("salt scores", () => {
  it("reads EDHREC's saltiest list and finds a deck's salty cards, saltiest first", () => {
    const list = parseSaltList(TOP);
    expect(list.get("stasis")?.salt).toBeCloseTo(3.05, 2);
    const hits = saltyCards(["Sol Ring", "Smothering Tithe", "Rhystic Study", "Rhystic Study"], list);
    expect(hits.map((h) => h.name)).toEqual(["Rhystic Study", "Smothering Tithe"]);
    expect(saltyCards(["Sol Ring"], parseSaltList(undefined))).toEqual([]);
  });

  it("puts them on the Rule 0 card", () => {
    const v = { deck: { name: "Tithe" } as never, commanders: [{ name: "Korvold" }] as never, cards: [] };
    const a = { bracket: { bracket: 3, name: "Upgraded", reasons: [], extraTurns: [], massLandDenial: [] } as never, stats: { gameChangers: [], roles: {} } as never, combos: [] };
    const r = rule0Summary(v, a, 3, [{ name: "Rhystic Study", salt: 2.82 }]);
    expect(r.text).toContain("Salty cards: Rhystic Study (2.8)");
    expect(rule0Summary(v, a, 3).text).not.toContain("Salty");
  });
});
