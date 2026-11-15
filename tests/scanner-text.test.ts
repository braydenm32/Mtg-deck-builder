import { describe, expect, it } from "vitest";
import { collectorScore, parseCollectorLine, parseCopyrightLine, setCodeVariants } from "@/scanner/collector";
import { NameIndex, normalizeName } from "@/scanner/names";

const CATALOG = [
  "Dispossess",
  "Disperse",
  "Opt",
  "Sol Ring",
  "Mishra's Helix",
  "Mistral Singer",
  "Karn, Scion of Urza",
  "Crown of Fury",
  "Horseshoe Crab",
  "Jhessian Infiltrator",
  "Sicarian Infiltrator",
  "Grip of Phyresis",
  "Grip of the Roil",
  "Brine Comber // Brinebound Gift",
  "Jötun Grunt",
  "Æther Vial",
];

describe("name matching", () => {
  const idx = new NameIndex(CATALOG);
  const top = (q: string) => idx.match(q, 3)[0];

  it("normalises accents, ligatures and punctuation", () => {
    expect(normalizeName("Jötun Grunt")).toBe("jotun grunt");
    expect(normalizeName("Æther Vial")).toBe("aether vial");
    expect(normalizeName("Mishra's  Helix!")).toBe("mishras helix");
  });

  it.each([
    ["Dispossess (2@", "Dispossess"],
    ["Grip of Phyresis                      2&", "Grip of Phyresis"],
    ["Jhessian lnfiltrator", "Jhessian Infiltrator"],
    ["Haishoe Cab:  i   2", "Horseshoe Crab"],
    ["Mishrals helix SEE", "Mishra's Helix"],
    ["Brine Comber  3U", "Brine Comber // Brinebound Gift"],
    ["Jotun Grunt", "Jötun Grunt"],
    ["Aether Vial", "Æther Vial"],
  ])("reads %j as %s", (ocr, expected) => {
    expect(top(ocr)?.name).toBe(expected);
  });

  it("scores exact reads near 1 and junk low", () => {
    expect(top("Sol Ring")?.score).toBeGreaterThan(0.95);
    expect(top("zzqx wvv") === undefined || top("zzqx wvv").score < 0.55).toBe(true);
  });

  it("autocompletes by prefix", () => {
    expect(idx.search("gri")).toEqual(["Grip of Phyresis", "Grip of the Roil"]);
  });
});

describe("collector line", () => {
  it("parses the 2015-2022 layout", () => {
    expect(parseCollectorLine("086/269 R\nAKH • EN  ~ MARK BEHM")).toEqual({
      collectorNumber: "86",
      setTotal: "269",
      rarity: "R",
      setCode: "AKH",
      lang: "en",
    });
  });

  it("parses the 2023+ layout (rarity first, 4-digit number)", () => {
    expect(parseCollectorLine("R 0189\nFRA EN DARREN TAN")).toMatchObject({ collectorNumber: "189", rarity: "R", setCode: "FRA", lang: "en" });
    expect(parseCollectorLine("M0700\nMSC EN CARISSA")).toMatchObject({ collectorNumber: "700", rarity: "M", setCode: "MSC" });
  });

  it("fixes letters OCR returns for digits", () => {
    expect(parseCollectorLine("O86/2G9 R\nAKH * EN")).toMatchObject({ collectorNumber: "86", setCode: "AKH" });
  });

  it("maps printed language codes to Scryfall's", () => {
    expect(parseCollectorLine("123/280 C\nNEO • JP").lang).toBe("ja");
    expect(parseCollectorLine("123/280 C\nNEO • CS").lang).toBe("zhs");
  });

  it("ignores look-alike set/language pairs in stray text and artist names", () => {
    expect(parseCollectorLine("TAT. IT\nR 0562\nWHO EN TYLER")).toMatchObject({ setCode: "WHO", lang: "en" });
    expect(parseCollectorLine("123/280 C\nNEO • EN JOHN DE SOUZA")).toMatchObject({ setCode: "NEO", lang: "en" });
  });

  it("returns nothing for noise", () => {
    expect(parseCollectorLine("E C S")).toEqual({});
  });

  it("scores printings, preferring the original over The List", () => {
    const info = parseCollectorLine("006/281 U\nAFR • EN");
    const orig = collectorScore(info, { set: "afr", collectorNumber: "6" });
    const list = collectorScore(info, { set: "plst", collectorNumber: "AFR-6" });
    const other = collectorScore(info, { set: "afc", collectorNumber: "60" });
    expect(orig).toBe(1);
    expect(list).toBeGreaterThan(0.9);
    expect(list).toBeLessThan(orig);
    expect(other).toBeLessThan(0.5);
  });
});

describe("copyright line (cards before 2015)", () => {
  it("reads the number, set size and year from real OCR output", () => {
    expect(parseCopyrightLine("& 1993-2003 Wizards ofithe Coast, Inc. 78/143")).toEqual({ year: 2003, collectorNumber: "78", setTotal: "143" });
    expect(parseCopyrightLine("IISEIVAAT IE 74140,\n1993-1998 Wizards of the Coast, Inc. 57/350")).toEqual({ year: 1998, collectorNumber: "57", setTotal: "350" });
    expect(parseCopyrightLine("TM & 2013 Wizards of the Coast 6/249")).toEqual({ year: 2013, collectorNumber: "6", setTotal: "249" });
  });

  it("skips power/toughness and takes the number at the end", () => {
    expect(parseCopyrightLine("Illus. Greg Hildebrandt 1/1\n& 1993-2003 Wizards 78/143").collectorNumber).toBe("78");
  });

  it("returns just the year when there's no number", () => {
    expect(parseCopyrightLine("TM & © 2019 Wizards of the Coast")).toEqual({ year: 2019 });
  });
});

describe("misread collector lines", () => {
  it("reads 'ID' and 'IP' as JP (Japanese)", () => {
    expect(parseCollectorLine("347     R\nC21 ID B MAGALLI VIILENEUVE")).toMatchObject({ setCode: "C21", lang: "ja", collectorNumber: "347", rarity: "R" });
    expect(parseCollectorLine("347 R\nC21 IP KB MAGALL")).toMatchObject({ lang: "ja" });
  });

  it("suggests look-alike set codes", () => {
    expect(setCodeVariants("C91")).toContain("C21");
    expect(setCodeVariants("WADR")).toContain("WAR");
    expect(setCodeVariants("NE0")).toContain("NEO");
    expect(setCodeVariants("WAR")).not.toContain("WAR");
  });
});
