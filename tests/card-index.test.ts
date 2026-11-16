import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import { cardList } from "@/lib/cards/card-list";
import { searchCardNames } from "@/lib/cards/lookup";
import { cardNameRows, clearCardNameRows } from "@/lib/cards/name-cache";
import { fitsIdentity, matchNames } from "@/lib/cards/name-search";
import { NON_DECK_LAYOUTS } from "@/lib/cards/rows";
import { parseCardList, searchCardIndex } from "@/lib/offline/card-index";
import { seededDb } from "./helpers";

describe("card list kept on the device", () => {
  let db: Db;
  let cleanup: () => void;
  beforeAll(async () => {
    ({ db, cleanup } = await seededDb());
    clearCardNameRows();
  });
  afterAll(() => cleanup());

  it("finds the same cards as the server's search in a deck's colours and for commanders", async () => {
    const index = parseCardList(JSON.parse(cardList(await cardNameRows(db)).body).cards);
    expect(index.length).toBeGreaterThan(0);
    const queries = ["sol", "kor", "a", "e", "dragon", "of the", "mutav", "lightning", "zzz"];
    for (const q of queries) {
      for (const identity of ["", "W", "UB", "RG", "WUBRG"]) {
        const server = (await searchCardNames(db, q, 20, { identity })).map((c) => c.oracleId);
        expect(searchCardIndex(index, q, { identity }).map((c) => c.oracleId), `${q} in ${identity || "colourless"}`).toEqual(server);
      }
      const commanders = (await searchCardNames(db, q, 20, { commander: true })).map((c) => c.oracleId);
      expect(searchCardIndex(index, q, { commander: true }).map((c) => c.oracleId), `${q} commanders`).toEqual(commanders);
    }
  });

  it("leaves out tokens and the like, and tags the list so an unchanged one isn't sent again", async () => {
    const rows = await cardNameRows(db);
    const list = cardList(rows);
    const parsed = JSON.parse(list.body).cards as unknown[][];
    expect(parsed.length).toBe(rows.filter((r) => !NON_DECK_LAYOUTS.includes(r.layout)).length);
    expect(cardList([...rows]).etag).toBe(list.etag);
    expect(cardList([{ ...rows[0], name: rows[0].name + "!" }, ...rows.slice(1)]).etag).not.toBe(list.etag);
  });

  it("matches names from the start first, then anywhere, within the limit", () => {
    const rows = ["Sol Ring", "Solemn Simulacrum", "Arcane Signet", "Consoling Solace"].map((name) => ({ normName: name.toLowerCase(), name }));
    expect(matchNames(rows, "sol", 10).map((r) => r.name)).toEqual(["Sol Ring", "Solemn Simulacrum", "Consoling Solace"]);
    expect(matchNames(rows, "sol", 1).map((r) => r.name)).toEqual(["Sol Ring"]);
    expect(matchNames(rows, "  ", 10)).toEqual([]);
    expect(fitsIdentity("WU")("U")).toBe(true);
    expect(fitsIdentity("WU")("UB")).toBe(false);
    expect(fitsIdentity("")("")).toBe(true);
    expect(fitsIdentity(undefined)("WUBRG")).toBe(true);
  });
});
