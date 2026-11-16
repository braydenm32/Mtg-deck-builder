import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import { storeScryfallCards } from "@/lib/cards/store";
import { cardRulings } from "@/lib/cards/rulings";
import type { ScryfallCard } from "@/lib/scryfall/client";
import { tempDb } from "./helpers";

const card = {
  object: "card",
  id: "00000000-0000-4000-8000-000000000001",
  oracle_id: "11111111-0000-4000-8000-000000000001",
  name: "Rule Test",
  lang: "en",
  released_at: "2024-01-01",
  layout: "normal",
  mana_cost: "{1}",
  cmc: 1,
  type_line: "Artifact",
  oracle_text: "",
  colors: [],
  color_identity: [],
  keywords: [],
  legalities: { commander: "legal" },
  games: ["paper"],
  set: "tst",
  set_name: "Test",
  set_type: "expansion",
  collector_number: "1",
  rarity: "rare",
  finishes: ["nonfoil"],
  prices: {},
  image_uris: { small: "s.jpg", normal: "n.jpg" },
} as unknown as ScryfallCard;

let db: Db;
let cleanup: () => void;
beforeEach(async () => {
  ({ db, cleanup } = await tempDb());
  await storeScryfallCards(db, [card]);
});
afterEach(() => cleanup());

describe("cardRulings", () => {
  it("fetches once, newest first, then answers from what it kept", async () => {
    let calls = 0;
    const fake = async (path: string) => {
      calls++;
      expect(path).toBe(`/cards/${card.id}/rulings`);
      return {
        data: [
          { published_at: "2020-01-01", comment: "Old.", source: "wotc" },
          { published_at: "2024-05-01", comment: "New.", source: "scryfall" },
        ],
      };
    };
    const a = await cardRulings(db, card.oracle_id!, fake);
    expect(a.ok).toBe(true);
    expect(a.rulings.map((r) => [r.text, r.source])).toEqual([
      ["New.", "Scryfall"],
      ["Old.", "Wizards"],
    ]);
    const b = await cardRulings(db, card.oracle_id!, fake);
    expect(b.rulings).toHaveLength(2);
    expect(calls).toBe(1);
  });

  it("says it couldn't look when Scryfall is out of reach and nothing is kept", async () => {
    const r = await cardRulings(db, card.oracle_id!, async () => {
      throw new Error("offline");
    });
    expect(r).toEqual({ rulings: [], ok: false });
  });
});
