import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { collectionStats } from "@/lib/collection/collection-stats";
import { importCollection } from "@/lib/collection/import";
import { parseFilters, queryCollection } from "@/lib/collection/query";
import { hasSyntax, parseSearch } from "@/lib/collection/search-syntax";
import { seededDb } from "./helpers";

let db: Db;
let cleanup: () => void;
beforeAll(async () => {
  ({ db, cleanup } = await seededDb());
  const text = fs.readFileSync(path.join(__dirname, "fixtures", "csv", "manabox.csv"), "utf8");
  await importCollection(db, { text, online: false });
  await importCollection(db, {
    text: "1 Atraxa, Praetors' Voice\n2 Sakura-Tribe Elder\n1 Lightning Bolt (M10) 146\n1 Korvold, Fae-Cursed King",
    online: false,
  });
});
afterAll(() => cleanup());

const names = async (q: string) => (await queryCollection(db, parseFilters({ q }))).cards.map((c) => c.name);

describe("search syntax", () => {
  it("tells syntax from a plain search", () => {
    expect(hasSyntax("t:creature")).toBe(true);
    expect(hasSyntax("mv<=3")).toBe(true);
    expect(hasSyntax("-is:foil")).toBe(true);
    expect(hasSyntax("Korvold, Fae-Cursed King")).toBe(false);
    expect(hasSyntax("draw a card")).toBe(false);
  });

  it("filters by type, text, mana value and colour identity", async () => {
    expect(await names("t:legendary")).toEqual(["Atraxa, Praetors' Voice", "Korvold, Fae-Cursed King"]);
    expect(await names('o:"search your library"')).toEqual(["Sakura-Tribe Elder"]);
    expect(await names("mv<=1")).toEqual(["Lightning Bolt", "Sol Ring", "Viscera Seer"]);
    // id: fits a deck of those colours; a guild name works too.
    expect(await names("id:golgari")).toEqual(["Sakura-Tribe Elder", "Sol Ring", "Viscera Seer"]);
    expect(await names("id:bg -t:artifact")).toEqual(["Sakura-Tribe Elder", "Viscera Seer"]);
    expect(await names("id=c")).toEqual(["Sol Ring"]);
    expect(await names("id:m")).toEqual(["Atraxa, Praetors' Voice", "Korvold, Fae-Cursed King"]);
  });

  it("filters by colour, rarity, set and finish", async () => {
    expect(await names("c:r")).toEqual(["Korvold, Fae-Cursed King", "Lightning Bolt"]);
    expect(await names("c=r")).toEqual(["Lightning Bolt"]);
    expect(await names("r>=rare")).toEqual(["Atraxa, Praetors' Voice", "Korvold, Fae-Cursed King"]);
    expect(await names("s:m10")).toEqual(["Lightning Bolt"]);
    expect(await names("is:foil")).toEqual(["Viscera Seer"]);
    expect(await names("is:commander t:dragon")).toEqual(["Korvold, Fae-Cursed King"]);
  });

  it("keeps plain words matching name, type or text, and reports terms it doesn't know", async () => {
    expect(await names("elder t:creature")).toEqual(["Sakura-Tribe Elder"]);
    const p = parseSearch("t:creature foo:bar mv:abc", sql`0`);
    expect(p.parts).toHaveLength(1);
    expect(p.unknown).toEqual(["foo:bar", "mv:abc"]);
  });
});

describe("collection stats", () => {
  it("counts colours, types, curve, rarities and sets with links", async () => {
    const s = await collectionStats(db);
    expect(s.facts).toMatchObject({ unique: 6, commanders: 2, foils: 3 });
    expect(s.colours.find((b) => b.key === "M")).toMatchObject({ count: 2, href: "/collection?q=id%3Am" });
    expect(s.colours.find((b) => b.key === "C")?.count).toBe(1);
    expect(s.types.find((b) => b.key === "creature")?.count).toBe(4);
    expect(s.curve.find((b) => b.key === "1")).toMatchObject({ count: 3, href: `/collection?q=${encodeURIComponent("mv=1 -t:land")}` });
    expect(s.rarities.map((r) => r.key)).toEqual(["mythic", "uncommon", "common"]);
    expect(s.sets.reduce((n, b) => n + b.count, 0)).toBe(9);
  });
});
