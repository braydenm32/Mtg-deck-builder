import { describe, expect, it } from "vitest";
import { entriesToExportLines, exportDecklist, parseDecklist, type ExportLine } from "@/lib/deck/decklist";
import { deck } from "./deck-fixtures";

const pick = (s: string) => parseDecklist(s).lines.map((l) => [l.quantity, l.name, l.board]);

describe("parseDecklist", () => {
  it("plain and Moxfield-style lines with set, number and finish", () => {
    const r = parseDecklist("1 Sol Ring (C21) 263 *F*\n1x Arcane Signet\nCultivate\n2 Forest (m21) 274\n1 Swords to Plowshares (STA) 10 *E*");
    expect(r.lines.map((l) => [l.quantity, l.name, l.setCode, l.collectorNumber, l.finish])).toEqual([
      [1, "Sol Ring", "c21", "263", "foil"],
      [1, "Arcane Signet", undefined, undefined, "nonfoil"],
      [1, "Cultivate", undefined, undefined, "nonfoil"],
      [2, "Forest", "m21", "274", "nonfoil"],
      [1, "Swords to Plowshares", "sta", "10", "etched"],
    ]);
    expect(r.noCommanderMarked).toBe(true);
  });

  it("section headers (Arena, Moxfield, with counts and colons)", () => {
    expect(pick("Commander\n1 Atraxa, Praetors' Voice\n\nDeck\n1 Sol Ring\nSideboard (1):\n1 Negate\nMaybeboard\n1 Cultivate\nTokens\n1 Treasure")).toEqual([
      [1, "Atraxa, Praetors' Voice", "commander"],
      [1, "Sol Ring", "main"],
      [1, "Negate", "side"],
      [1, "Cultivate", "maybe"],
    ]);
    expect(parseDecklist("Commander\n1 Atraxa, Praetors' Voice\nDeck\n1 Sol Ring").noCommanderMarked).toBe(false);
  });

  it("Archidekt categories and tags", () => {
    const r = parseDecklist("1x Atraxa, Praetors' Voice (c16) 28 [Commander{top}]\n1x Sol Ring (c21) 263 [Ramp] ^Have,#37d67a^\n1x Cultivate [Ramp,Maybeboard{noDeck}{noPrice}]");
    expect(r.lines.map((l) => [l.name, l.board, l.tags])).toEqual([
      ["Atraxa, Praetors' Voice", "commander", []],
      ["Sol Ring", "main", ["Ramp"]],
      ["Cultivate", "maybe", ["Ramp"]],
    ]);
  });

  it("TappedOut *CMDR*, inline Commander:, and // category comments", () => {
    expect(pick("1 Korvold, Fae-Cursed King *CMDR*\n1 Sol Ring")).toEqual([[1, "Korvold, Fae-Cursed King", "commander"], [1, "Sol Ring", "main"]]);
    expect(pick("Commander: Thrasios, Triton Hero + Tymna the Weaver\n1 Sol Ring")).toEqual([
      [1, "Thrasios, Triton Hero", "commander"],
      [1, "Tymna the Weaver", "commander"],
      [1, "Sol Ring", "main"],
    ]);
    const r = parseDecklist("// Ramp\n1 Sol Ring\n// Removal (2)\n1 Swords to Plowshares");
    expect(r.lines.map((l) => l.tags)).toEqual([["Ramp"], ["Removal"]]);
  });

  it("MTGO lists: the commander is the block after the blank line", () => {
    const main = Array.from({ length: 99 }, () => "1 Forest").join("\n");
    const r = parseDecklist(`${main}\n\n1 Atraxa, Praetors' Voice`);
    expect(r.lines.at(-1)).toMatchObject({ name: "Atraxa, Praetors' Voice", board: "commander" });
    expect(r.noCommanderMarked).toBe(false);
    // A short list with a trailing block is a sideboard, not a commander.
    expect(pick("4 Lightning Bolt\n\n2 Negate")).toEqual([[4, "Lightning Bolt", "main"], [2, "Negate", "side"]]);
  });

  it("split-card names and junk lines", () => {
    const r = parseDecklist("1 Fire / Ice\n1 Fire//Ice\n12\n");
    expect(r.lines.map((l) => l.name)).toEqual(["Fire // Ice", "Fire // Ice"]);
    expect(r.skipped).toHaveLength(1);
  });
});

describe("exportDecklist", () => {
  const lines: ExportLine[] = [
    { name: "Atraxa, Praetors' Voice", quantity: 1, board: "commander", setCode: "c16", collectorNumber: "28" },
    { name: "Sol Ring", quantity: 1, setCode: "c21", collectorNumber: "263", finish: "foil", category: "Ramp" },
    { name: "Fable of the Mirror-Breaker // Reflection of Kiki-Jiki", quantity: 1, layout: "transform" },
    { name: "Fire // Ice", quantity: 1, layout: "split" },
    { name: "Forest", quantity: 30 },
    { name: "Cultivate", quantity: 1, board: "maybe" },
  ];

  it("plain text", () => {
    expect(exportDecklist(lines, "text")).toBe(
      "Commander\n1 Atraxa, Praetors' Voice\n\nDeck\n1 Sol Ring\n1 Fable of the Mirror-Breaker // Reflection of Kiki-Jiki\n1 Fire // Ice\n30 Forest\n\nMaybeboard\n1 Cultivate\n",
    );
  });

  it("Moxfield keeps printings and foil marks", () => {
    expect(exportDecklist(lines, "moxfield")).toContain("1 Sol Ring (C21) 263 *F*");
  });

  it("Arena uses front names for double-faced cards and has no maybeboard", () => {
    const out = exportDecklist(lines, "arena");
    expect(out).toContain("Commander\n1 Atraxa, Praetors' Voice (C16) 28");
    expect(out).toContain("1 Fable of the Mirror-Breaker\n");
    expect(out).not.toContain("Cultivate");
  });

  it("MTGO puts the commander after the main deck and writes split cards with one slash", () => {
    const out = exportDecklist(lines, "mtgo");
    expect(out.trim().split("\n\n").at(-1)).toBe("1 Atraxa, Praetors' Voice");
    expect(out).toContain("1 Fire/Ice");
  });

  it("Archidekt categories mark the commander and maybeboard", () => {
    const out = exportDecklist(lines, "archidekt");
    expect(out).toContain("1x Atraxa, Praetors' Voice (c16) 28 [Commander{top}]");
    expect(out).toContain("1x Sol Ring (c21) 263 *F* [Ramp]");
    expect(out).toContain("1x Cultivate [Maybeboard{noDeck}{noPrice}]");
  });

  it("round-trips through the parser", () => {
    for (const format of ["text", "moxfield", "arena", "archidekt"] as const) {
      const parsed = parseDecklist(exportDecklist(lines, format));
      const commander = parsed.lines.find((l) => l.board === "commander");
      expect(commander?.name).toBe("Atraxa, Praetors' Voice");
      expect(parsed.lines.find((l) => l.name === "Forest")?.quantity).toBe(30);
    }
    const fromDeck = entriesToExportLines(deck(["Korvold, Fae-Cursed King"], ["Sol Ring"], { basics: ["Swamp"] }));
    const parsed = parseDecklist(exportDecklist(fromDeck, "mtgo"));
    expect(parsed.lines.find((l) => l.board === "commander")?.name).toBe("Korvold, Fae-Cursed King");
  });
});
