import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { detectSource, parseCollectionCsv } from "@/lib/ingest/csv";
import { looksLikeCsv, parseCardList } from "@/lib/ingest/text";

const csv = (name: string) => fs.readFileSync(path.join(__dirname, "fixtures", "csv", `${name}.csv`), "utf8");

describe("detectSource", () => {
  it.each([
    ["mythic-tools", "mythic-tools"],
    ["manabox", "manabox"],
    ["moxfield", "moxfield"],
    ["archidekt", "archidekt"],
    ["deckbox", "deckbox"],
    ["tcgplayer-app", "tcgplayer-app"],
    ["delver-lens", "delver-lens"],
    ["generic", "generic"],
  ])("%s", (file, expected) => {
    const headers = parseCollectionCsv(csv(file)).headers;
    expect(detectSource(headers)).toBe(expected);
  });

  it("recognises Mythic Tools' alternative English Name header", () => {
    expect(detectSource(["English Name", "Set Code", "Collector Number", "Finish", "Scryfall ID", "Quantity"])).toBe("mythic-tools");
  });
});

describe("parseCollectionCsv", () => {
  it("Mythic Tools: Scryfall IDs, finish, containers, language", () => {
    const p = parseCollectionCsv(csv("mythic-tools"));
    expect(p.errors).toEqual([]);
    expect(p.rows).toHaveLength(4);
    const [sol, atraxa, , karn] = p.rows.map((r) => r.entry);
    expect(sol).toMatchObject({ quantity: 2, finish: "nonfoil", condition: "NM", location: "bulk" });
    expect(sol.identity.scryfallId).toBe("4cbc6901-6a4a-4d0a-83ea-7eefa3b35021");
    expect(atraxa).toMatchObject({ finish: "foil", location: "Commanders" });
    expect(karn.identity).toMatchObject({ lang: "ja", setCode: "war", collectorNumber: "1" });
  });

  it("ManaBox: normal/foil, condition codes", () => {
    const p = parseCollectionCsv(csv("manabox"));
    expect(p.rows.map((r) => [r.entry.finish, r.entry.condition, r.entry.purchasePrice])).toEqual([
      ["nonfoil", "near_mint", 1.5],
      ["foil", "lightly_played", 0.25],
    ]);
  });

  it("Moxfield: Edition is a set code, blank foil = nonfoil", () => {
    const p = parseCollectionCsv(csv("moxfield"));
    expect(p.rows[0].entry.identity).toMatchObject({ name: "Sol Ring", setCode: "c21", collectorNumber: "263", lang: "en" });
    expect(p.rows[0].entry.finish).toBe("nonfoil");
    expect(p.rows[1].entry).toMatchObject({ quantity: 2, finish: "foil" });
  });

  it("Deckbox: Edition is a set name", () => {
    const p = parseCollectionCsv(csv("deckbox"));
    expect(p.rows[0].entry.identity).toMatchObject({ name: "Lightning Bolt", setName: "Magic 2010", collectorNumber: "146" });
    expect(p.rows[0].entry.identity.setCode).toBeUndefined();
    expect(p.rows[0].entry.purchasePrice).toBe(2);
    expect(p.rows[1].entry.finish).toBe("foil");
  });

  it("TCGplayer: prefers Simple Name, Set Code over Set", () => {
    const p = parseCollectionCsv(csv("tcgplayer-app"));
    expect(p.rows[1].entry.identity).toMatchObject({ name: "Grist, the Hunger Tide", setCode: "DSC", collectorNumber: "220" });
  });

  it("generic semicolon CSV with loose headers", () => {
    const p = parseCollectionCsv(csv("generic"));
    expect(p.rows.map((r) => [r.entry.quantity, r.entry.identity.name, r.entry.identity.setCode])).toEqual([
      [3, "Sakura-Tribe Elder", undefined],
      [1, "Viscera Seer", "soc"],
    ]);
  });

  it("skips zero quantities and explains missing columns", () => {
    const p = parseCollectionCsv("Foo,Bar\n1,2\n");
    expect(p.errors[0]).toMatch(/Couldn't find a card name/);
    const z = parseCollectionCsv("Name,Quantity\nSol Ring,0\nSol Ring,1\n");
    expect(z.rows).toHaveLength(1);
    expect(z.skipped[0].reason).toMatch(/Quantity is 0/);
  });

  it("strips a BOM and Excel's sep= line", () => {
    const p = parseCollectionCsv("﻿sep=,\nName,Count\nSol Ring,2\n");
    expect(p.rows[0].entry).toMatchObject({ quantity: 2, identity: { name: "Sol Ring" } });
  });
});

describe("parseCardList", () => {
  it("reads Moxfield/Arena style lines and skips headers", () => {
    const { rows, skipped } = parseCardList(
      ["Commander", "1 Atraxa, Praetors' Voice", "", "Deck", "4x Sol Ring (C21) 263 *F*", "Lightning Bolt", "// ramp", "2 Fire // Ice (DMR) 215 *E*"].join("\n"),
    );
    expect(skipped).toEqual([]);
    expect(rows.map((r) => [r.entry.quantity, r.entry.identity.name, r.entry.identity.setCode, r.entry.identity.collectorNumber, r.entry.finish])).toEqual([
      [1, "Atraxa, Praetors' Voice", undefined, undefined, "nonfoil"],
      [4, "Sol Ring", "C21", "263", "foil"],
      [1, "Lightning Bolt", undefined, undefined, "nonfoil"],
      [2, "Fire // Ice", "DMR", "215", "etched"],
    ]);
  });

  it("tells CSV from a card list", () => {
    expect(looksLikeCsv(csv("moxfield"))).toBe(true);
    expect(looksLikeCsv(csv("generic"))).toBe(true);
    expect(looksLikeCsv("4 Sol Ring\n1 Lightning Bolt")).toBe(false);
  });
});

describe("real Mythic Tools export (Brayden's bulk list, prices stripped)", () => {
  const p = parseCollectionCsv(csv("mythic-tools-real"));
  it("is detected and fully parsed", () => {
    expect(p.source).toBe("mythic-tools");
    expect(p.errors).toEqual([]);
    expect(p.rows).toHaveLength(115);
    expect(p.rows.every((r) => /^[0-9a-f-]{36}$/.test(r.entry.identity.scryfallId ?? ""))).toBe(true);
  });
  it("maps finish, location and flags", () => {
    expect(p.rows.filter((r) => r.entry.finish === "foil")).toHaveLength(26);
    expect(new Set(p.rows.map((r) => r.entry.location))).toEqual(new Set(["bulk"]));
    expect(p.rows.some((r) => r.entry.proxy)).toBe(false);
    expect(p.columns.purchasePrice).toBe("Purchase Price (USD)");
  });
});
