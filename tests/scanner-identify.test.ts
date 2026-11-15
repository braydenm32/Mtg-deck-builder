import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import { identifyCard, imageHashes, type RecognizerDeps } from "@/scanner/identify";
import type { CardLookup, Printing } from "@/scanner/lookup";
import { NameIndex } from "@/scanner/names";
import type { OcrEngine, OcrOptions } from "@/scanner/ocr";
import { LocalCardLookup } from "@/scanner/server";
import { allCardNames } from "@/lib/cards/lookup";
import { fakeCard } from "./scanner-helpers";
import { seededDb } from "./helpers";

/** OCR stand-in: returns scripted text for the name pass and the collector pass. */
function fakeOcr(name: string, collector = ""): OcrEngine {
  return {
    async recognize(_img, opts: OcrOptions) {
      // Name passes ask for 'block' (band) then 'line'; the collector pass uses the digit whitelist.
      const isCollector = opts.whitelist?.includes("/") && !opts.whitelist.includes("a");
      return { text: isCollector ? collector : name, confidence: 80 };
    },
    async terminate() {},
  };
}

const printing = (id: string, set: string, cn: string, extra: Partial<Printing> = {}): Printing => ({
  scryfallId: id,
  name: "Test Card",
  set,
  setName: set.toUpperCase(),
  collectorNumber: cn,
  lang: "en",
  rarity: "rare",
  finishes: ["nonfoil", "foil"],
  imageNormal: `img:${id}`,
  ...extra,
});

describe("identifyCard (fake OCR, in-memory printings)", () => {
  // Three printings: two share art (seed 1), one has different art (seed 7).
  const prints = [printing("a", "aaa", "10"), printing("b", "bbb", "20"), printing("c", "ccc", "30")];
  const art: Record<string, number> = { a: 1, b: 1, c: 7 };
  const lookup: CardLookup = {
    async printingsByName(name) {
      return name === "Test Card" ? prints : [];
    },
    async bySetAndNumber(set, cn) {
      return prints.find((p) => p.set === set.toLowerCase() && p.collectorNumber === cn) ?? null;
    },
  };
  const deps = (name: string, collector = ""): RecognizerDeps => ({
    ocr: fakeOcr(name, collector),
    names: new NameIndex(["Test Card", "Other Thing"]),
    lookup,
    loadImage: async (url) => fakeCard(art[url.slice(4)], 630, 880),
    hashCache: new Map(),
  });

  it("uses the collector line to pick between printings with the same art", async () => {
    const res = await identifyCard(fakeCard(1, 630, 880), deps("Test Card", "020/300 R\nBBB • EN"));
    expect(res.status).toBe("matched");
    expect(res.best?.printing.scryfallId).toBe("b");
    expect(res.best?.collectorScore).toBe(1);
  });

  it("uses the art to pick the printing when the collector line is unreadable", async () => {
    const res = await identifyCard(fakeCard(7, 630, 880), deps("Test Card  2G"));
    expect(res.best?.printing.scryfallId).toBe("c");
    expect(res.status).toBe("matched");
  });

  it("asks the user when two printings look identical and nothing else tells them apart", async () => {
    const res = await identifyCard(fakeCard(1, 630, 880), deps("Test Card"));
    expect(["a", "b"]).toContain(res.best?.printing.scryfallId);
    expect(res.status).toBe("uncertain");
  });

  it("falls back to the collector line when the name is unreadable", async () => {
    const res = await identifyCard(fakeCard(7, 630, 880), deps("~~ ##", "R 0030\nCCC • EN"));
    expect(res.best?.printing.scryfallId).toBe("c");
    expect(res.status).not.toBe("not-found");
  });

  it("reports not-found when nothing is readable", async () => {
    const res = await identifyCard(fakeCard(7, 630, 880), deps("~~ ##"));
    expect(res.status).toBe("not-found");
    expect(res.candidates).toEqual([]);
  });

  it("hashes are deterministic", () => {
    expect(imageHashes(fakeCard(4, 630, 880))).toEqual(imageHashes(fakeCard(4, 630, 880)));
  });
});

describe("LocalCardLookup (card database)", () => {
  let db: Db;
  let cleanup: () => void;
  beforeAll(async () => ({ db, cleanup } = await seededDb()));
  afterAll(() => cleanup());

  it("finds printings by name and by set + number", async () => {
    const lookup = new LocalCardLookup(db);
    const byName = await lookup.printingsByName("Sol Ring");
    expect(byName[0]).toMatchObject({ name: "Sol Ring", set: "c21", collectorNumber: "263" });
    expect(byName[0].imageNormal).toMatch(/^https:\/\/cards\.scryfall\.io\//);
    const bySet = await lookup.bySetAndNumber("C21", "0263", "en");
    expect(bySet?.scryfallId).toBe(byName[0].scryfallId);
    expect(await lookup.bySetAndNumber("zzz", "1")).toBeNull();
  });

  it("builds a name index from the database that reads OCR'd names", async () => {
    const idx = new NameIndex((await allCardNames(db)).map((r) => r.name));
    expect(idx.match("Fable of the Mirror-Breaker  2R", 1)[0].name).toBe("Fable of the Mirror-Breaker // Reflection of Kiki-Jiki");
    expect(idx.match("Sakura-Tribe Elcler", 1)[0].name).toBe("Sakura-Tribe Elder");
  });
});
