import { describe, expect, it } from "vitest";
import { pick, type Printing } from "@/lib/cards/match";
import { variantRank } from "@/lib/cards/rows";
import type { ScryfallCard } from "@/lib/scryfall/client";

const base: Printing = {
  id: "x",
  oracleId: "o",
  name: "Mana Vault",
  setCode: "ema",
  setName: "Eternal Masters",
  collectorNumber: "224",
  lang: "en",
  rarity: "mythic",
  setType: "masters",
  variantRank: 0,
  finishes: ["nonfoil", "foil"],
  tcgplayerId: null,
  releasedAt: "2016-06-10",
  imageNormal: null,
  imageSmall: null,
  priceUsd: null,
  priceUsdFoil: null,
  priceUsdEtched: null,
  updatedAt: "",
};
const p = (over: Partial<Printing>): Printing => ({ ...base, ...over });

describe("pick", () => {
  const regular = p({ id: "regular" });
  const serialized = p({ id: "sld", setCode: "sld", setType: "box", collectorNumber: "796★", variantRank: 9, finishes: ["foil"], releasedAt: "2024-01-01" });
  const japanese = p({ id: "ja", lang: "ja", releasedAt: "2020-01-01" });

  it("prefers a regular printing over a newer special one", () => {
    expect(pick([serialized, regular], undefined, "nonfoil")?.id).toBe("regular");
    expect(pick([serialized, regular])?.id).toBe("regular");
  });
  it("prefers the requested language, then English", () => {
    expect(pick([regular, japanese], "ja")?.id).toBe("ja");
    expect(pick([japanese, regular], "de")?.id).toBe("regular");
  });
  it("prefers a printing made in the requested finish", () => {
    const nonfoilOnly = p({ id: "nf", finishes: ["nonfoil"], releasedAt: "2023-01-01" });
    expect(pick([nonfoilOnly, regular], undefined, "foil")?.id).toBe("regular");
  });
});

describe("variantRank", () => {
  const card = (over: Partial<ScryfallCard>) =>
    ({ set: "ema", set_type: "masters", collector_number: "224", finishes: ["nonfoil", "foil"], ...over }) as ScryfallCard;
  it("ranks regular printings 0 and specials higher", () => {
    expect(variantRank(card({}))).toBe(0);
    expect(variantRank(card({ set: "sld", set_type: "box", collector_number: "796★", promo_types: ["serialized"], finishes: ["foil"] }))).toBeGreaterThan(5);
    expect(variantRank(card({ border_color: "borderless", frame_effects: ["showcase"] }))).toBeGreaterThan(0);
  });
});
