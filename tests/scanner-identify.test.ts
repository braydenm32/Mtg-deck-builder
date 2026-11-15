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

/** OCR stand-in: returns scripted text for the name, collector and copyright passes. */
function fakeOcr(name: string, collector = "", copyright = ""): OcrEngine {
  return {
    async recognize(_img, opts: OcrOptions) {
      // Name passes ask for 'block' (band) then 'line'; the collector pass uses the
      // uppercase+digit whitelist; the copyright pass allows "&".
      const isCopyright = !!opts.whitelist?.includes("&") && !opts.whitelist.includes("'");
      const isCollector = !isCopyright && opts.whitelist?.includes("/") && !opts.whitelist.includes("a");
      return { text: isCopyright ? copyright : isCollector ? collector : name, confidence: 80 };
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

  it("reads a Japanese card by its collector line and keeps its language", async () => {
    const res = await identifyCard(fakeCard(7, 630, 880), deps("REORE -F57 72", "030/300 R\nCCC • JP"));
    expect(res.best?.printing.scryfallId).toBe("c");
    expect(res.lang).toBe("ja");
    expect(res.status).toBe("matched");
  });

  it("corrects a look-alike set code when the rarity agrees", async () => {
    // "BBB" misread as "8BB"; JP misread as "ID"
    const res = await identifyCard(fakeCard(1, 630, 880), deps("REORE -F57 72", "020/300 R\n8BB ID 6B ARTIST"));
    expect(res.best?.printing.scryfallId).toBe("b");
    expect(res.lang).toBe("ja");
  });
});

describe("identifyCard on older cards (number and year, no set code)", () => {
  // Two sets of 143 cards with a #78, from different years and with different art.
  const old = [
    printing("w", "scg", "78", { name: "Undead Warchief", releasedAt: "2003-05-26", imageNormal: "img:w" }),
    printing("x", "jud", "78", { name: "Arcane Teachings", releasedAt: "2002-05-27", imageNormal: "img:x" }),
    printing("y", "mbs", "78", { name: "Creeping Corrosion", releasedAt: "2011-02-04", imageNormal: "img:y" }),
  ];
  const art: Record<string, number> = { w: 2, x: 9, y: 5 };
  const lookup: CardLookup = {
    async printingsByName(name) {
      return old.filter((p) => p.name === name);
    },
    async bySetAndNumber() {
      return null;
    },
    async byNumberAndTotal(cn, total) {
      return total === 143 ? old.filter((p) => p.collectorNumber === cn) : [];
    },
  };
  const deps = (name: string, copyright: string): RecognizerDeps => ({
    ocr: fakeOcr(name, "", copyright),
    names: new NameIndex(old.map((p) => p.name)),
    lookup,
    loadImage: async (url) => fakeCard(art[url.slice(4)], 630, 880),
    hashCache: new Map(),
  });

  it("finds the card from '78/143' and the year when the title is readable", async () => {
    const res = await identifyCard(fakeCard(2, 630, 880), deps("Undead Warchief", "TM & © 1993-2003 Wizards of the Coast, Inc. 78/143"));
    expect(res.best?.printing.scryfallId).toBe("w");
    expect(res.lang).toBe("en");
    expect(res.status).toBe("matched");
  });

  it("finds a non-English card by number, year and picture, and asks for its language", async () => {
    const res = await identifyCard(fakeCard(2, 630, 880), deps("~~ ##", "& 1993-2003 Wizards of the Coast, Inc. 78/143"));
    expect(res.best?.printing.scryfallId).toBe("w");
    expect(res.lang).toBeUndefined();
    expect(res.status).toBe("uncertain");
  });
});

describe("LocalCardLookup (card database)", () => {
  let db: Db;
  let cleanup: () => void;
  beforeAll(async () => ({ db, cleanup } = await seededDb()));
  afterAll(() => cleanup());

  it("finds printings by number within sets of about the printed size", async () => {
    const lookup = new LocalCardLookup(db);
    expect((await lookup.byNumberAndTotal("146", 146)).map((p) => p.name)).toEqual(["Lightning Bolt"]);
    expect(await lookup.byNumberAndTotal("146", 300)).toEqual([]);
  });

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
