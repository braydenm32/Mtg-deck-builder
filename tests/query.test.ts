import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import { importCollection } from "@/lib/collection/import";
import { ownedCard, parseFilters, queryCollection } from "@/lib/collection/query";
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

const names = async (params: Record<string, string>) =>
  (await queryCollection(db, parseFilters(params))).cards.map((c) => c.name);

describe("queryCollection", () => {
  it("groups stacks by card and totals copies", async () => {
    const r = await queryCollection(db, parseFilters({}));
    expect(r.totals).toMatchObject({ unique: 6, copies: 9 });
    expect(r.cards.find((c) => c.name === "Viscera Seer")).toMatchObject({ quantity: 3, foils: 3 });
  });

  it("filters by name, text and type", async () => {
    expect(await names({ q: "korv" })).toEqual(["Korvold, Fae-Cursed King"]);
    expect(await names({ type: "instant" })).toEqual(["Lightning Bolt"]);
    expect(await names({ commander: "1" })).toEqual(["Atraxa, Praetors' Voice", "Korvold, Fae-Cursed King"]);
  });

  it("filters by colour identity", async () => {
    // Playable in a Golgari (BG) deck: colourless Sol Ring, B Viscera Seer, G Sakura-Tribe Elder.
    expect(await names({ ci: "BG" })).toEqual(["Sakura-Tribe Elder", "Sol Ring", "Viscera Seer"]);
    expect(await names({ ci: "BRG", ciMode: "exact" })).toEqual(["Korvold, Fae-Cursed King"]);
    expect(await names({ ci: "U", ciMode: "includes" })).toEqual(["Atraxa, Praetors' Voice"]);
  });

  it("sorts", async () => {
    expect((await names({ sort: "cmc", dir: "desc" }))[0]).toBe("Korvold, Fae-Cursed King");
    expect((await names({ sort: "quantity" }))[0]).toBe("Viscera Seer");
  });

  it("paginates", async () => {
    const r = await queryCollection(db, { ...parseFilters({ page: "2" }), pageSize: 4 });
    expect(r).toMatchObject({ page: 2, pages: 2 });
    expect(r.cards).toHaveLength(2);
  });

  it("returns a card's stacks", async () => {
    const r = await queryCollection(db, parseFilters({ q: "viscera" }));
    const owned = await ownedCard(db, r.cards[0].oracleId);
    expect(owned?.stacks).toHaveLength(1);
    expect(owned?.stacks[0]).toMatchObject({ set_code: "soc", quantity: 3, finish: "foil", printing_confidence: "guessed" });
  });
});
