import { describe, expect, it } from "vitest";
import { THEME_CATALOG, catalogTheme, popularTypes, resolveTheme, searchThemes, typalSlug } from "@/lib/deck/theme-catalog";
import { joinThemes, themeLabel, themeParts, themeScore, typalType } from "@/lib/deck/themes";

describe("theme catalog", () => {
  it("has EDHREC's themes and every creature type", () => {
    expect(THEME_CATALOG.length).toBeGreaterThan(600);
    expect(catalogTheme("slivers")).toMatchObject({ label: "Slivers", type: "Sliver" });
    expect(catalogTheme("angels")?.decks).toBeGreaterThan(0);
    expect(catalogTheme("krakens")).toMatchObject({ label: "Krakens", type: "Kraken" });
    expect(new Set(THEME_CATALOG.map((t) => t.slug)).size).toBe(THEME_CATALOG.length);
    expect(popularTypes(30).map((t) => t.slug)).toEqual(expect.arrayContaining(["dragons", "angels", "slivers"]));
  });

  it("makes EDHREC-style slugs for creature types", () => {
    expect(typalSlug("Dragon")).toBe("dragons");
    expect(typalSlug("Elf")).toBe("elves");
    expect(typalSlug("Faerie")).toBe("faeries");
    expect(typalSlug("Sphinx")).toBe("sphinxes");
    expect(typalSlug("Ally")).toBe("allies");
    expect(typalSlug("Pegasus")).toBe("pegasi");
    expect(typalSlug("Time Lord")).toBe("time-lords");
    expect(typalSlug("Merfolk")).toBe("merfolk");
  });

  it("works out what was typed", () => {
    expect(resolveTheme("angel")).toBe("angels");
    expect(resolveTheme("Angels")).toBe("angels");
    expect(resolveTheme("dragon tribal")).toBe("dragons");
    expect(resolveTheme("silvers")).toBe("slivers");
    expect(resolveTheme("+1/+1 counters")).toBe("plus-1-plus-1-counters");
    expect(resolveTheme("Lands Matter")).toBe("lands-matter");
    expect(resolveTheme("elf")).toBe("elves");
    expect(resolveTheme("superfriends")).toBe("superfriends");
    expect(resolveTheme("  ")).toBeUndefined();
  });

  it("searches as you type, best match first", () => {
    expect(searchThemes("drag")[0].slug).toBe("dragons");
    expect(searchThemes("angel")[0].slug).toBe("angels");
    expect(searchThemes("sliv")[0].slug).toBe("slivers");
    expect(searchThemes("silvers").map((t) => t.slug)).toContain("slivers");
    expect(searchThemes("token")[0].slug).toBe("tokens");
    expect(searchThemes("")).toEqual([]);
  });

  it("scores cards for typal and keyword themes", () => {
    expect(typalType("slivers")).toBe("Sliver");
    expect(typalType("myr")).toBe("Myr");
    expect(typalType("combo")).toBeUndefined();
    expect(themeScore({ name: "x", typeLine: "Creature — Sliver", oracleText: "" }, "slivers")).toBe(1);
    expect(themeScore({ name: "x", typeLine: "Legendary Creature — Human", oracleText: "Other Elves you control get +1/+1." }, "elves")).toBe(0.8);
    expect(themeScore({ name: "x", typeLine: "Creature — Bird", oracleText: "Flying", keywords: ["Flying"] }, "flying")).toBe(1);
    expect(themeScore({ name: "x", typeLine: "Enchantment — Aura", oracleText: "Enchant creature" }, "auras")).toBe(1);
    expect(themeScore({ name: "x", typeLine: "Instant", oracleText: "Put a -1/-1 counter on target creature." }, "minus-1-minus-1-counters")).toBe(0.8);
    expect(themeScore({ name: "x", typeLine: "Instant", oracleText: "Draw a card." }, "combo")).toBe(0);
    expect(themeLabel("slivers")).toBe("Slivers");
    expect(themeLabel("time-lords")).toBe("Time Lords");
  });

  it("mixes up to three themes", () => {
    expect(themeParts("tokens+angels")).toEqual(["tokens", "angels"]);
    expect(themeParts("tokens, angels,tokens+vampires+dragons")).toEqual(["tokens", "angels", "vampires"]);
    expect(themeParts(null)).toEqual([]);
    expect(joinThemes(["angels", "angels", "vampires"])).toBe("angels+vampires");
    expect(joinThemes([])).toBeUndefined();
    expect(themeLabel("tokens+angels")).toBe("Tokens & Angels");
    const angel = { name: "Test Angel", typeLine: "Creature — Angel", oracleText: "Flying" };
    const maker = { name: "Test Maker", typeLine: "Sorcery", oracleText: "Create two 1/1 white Soldier creature tokens." };
    expect(themeScore(angel, "tokens+angels")).toBe(1);
    expect(themeScore(maker, "tokens+angels")).toBe(themeScore(maker, "tokens"));
    expect(themeScore(maker, "tokens")).toBeGreaterThan(0);
  });
});
