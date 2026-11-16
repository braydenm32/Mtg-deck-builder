import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import { storeScryfallCards } from "@/lib/cards/store";
import { addPrinting } from "@/lib/collection/service";
import { byCollectorNumber, setCards, setProgress } from "@/lib/collection/sets";
import { cardSearchFor } from "@/lib/deck/buy";
import type { ScryfallCard } from "@/lib/scryfall/client";
import { tempDb } from "./helpers";

let n = 0;
function printing(name: string, set: string, number: string, setType = "expansion"): ScryfallCard {
  n += 1;
  const hex = n.toString(16).padStart(12, "0");
  return {
    object: "card",
    id: `90000000-0000-4000-8000-${hex}`,
    oracle_id: `91111111-0000-4000-8000-${hex}`,
    name,
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
    set,
    set_name: `Set ${set.toUpperCase()}`,
    set_type: setType,
    collector_number: number,
    rarity: "common",
    finishes: ["nonfoil", "foil"],
    prices: { usd: "1.00" },
    image_uris: { small: "s.jpg", normal: "n.jpg" },
  } as unknown as ScryfallCard;
}

describe("set completion", () => {
  const a = [printing("A1", "aaa", "1"), printing("A2", "aaa", "2"), printing("A10", "aaa", "10"), printing("A2b", "aaa", "2a")];
  const b = [printing("B1", "bbb", "1"), printing("B2", "bbb", "2")];
  const token = printing("Token", "taaa", "1", "token");
  let db: Db;
  let cleanup: () => void;
  beforeAll(async () => {
    ({ db, cleanup } = await tempDb());
    await storeScryfallCards(db, [...a, ...b, token]);
    await addPrinting(db, { scryfallId: a[0].id, quantity: 2 }, { source: "manual" });
    await addPrinting(db, { scryfallId: a[0].id, finish: "foil" }, { source: "manual" });
    await addPrinting(db, { scryfallId: b[0].id }, { source: "manual" });
    await addPrinting(db, { scryfallId: b[1].id }, { source: "manual" });
    await addPrinting(db, { scryfallId: a[1].id, proxy: true }, { source: "manual" });
    await addPrinting(db, { scryfallId: token.id }, { source: "manual" });
  });
  afterAll(() => cleanup());

  it("counts each card once, leaves out proxies, and puts the nearest to complete first", async () => {
    expect((await setProgress(db)).map((s) => [s.code, s.owned, s.total])).toEqual([
      ["bbb", 2, 2],
      ["aaa", 1, 4],
    ]);
    expect((await setProgress(db, { all: true })).map((s) => s.code)).toEqual(["bbb", "taaa", "aaa"]);
  });

  it("lists a set in collector-number order with what you own", async () => {
    const set = await setCards(db, "AAA");
    expect(set?.cards.map((c) => [c.collectorNumber, c.owned])).toEqual([
      ["1", 3],
      ["2", 0],
      ["2a", 0],
      ["10", 0],
    ]);
    expect(await setCards(db, "zzz")).toBeUndefined();
    expect(["★1", "10", "2a", "2", "1"].sort(byCollectorNumber)).toEqual(["1", "2", "2a", "10", "★1"]);
  });
});

describe("store search links", () => {
  it("puts Australian stores first for AUD, and searches by the front face", () => {
    expect(cardSearchFor("AUD").slice(0, 2).map((s) => s.where)).toEqual(["AU", "AU"]);
    expect(cardSearchFor("USD")[0].where).toBe("US");
    const ck = cardSearchFor("USD").find((s) => s.id === "cardkingdom")!;
    expect(ck.url("Fire // Ice")).toBe("https://www.cardkingdom.com/catalog/search?filter%5Bname%5D=Fire");
  });
});
