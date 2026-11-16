import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ArtIndex, artInput, encodeArtIndex, projectFeatures } from "@/scanner/artindex";
import { ArtNet } from "@/scanner/artnet";
import { resizeRGBA } from "@/scanner/image";
import { identifyCard, type RecognizerDeps } from "@/scanner/identify";
import type { CardLookup, Printing } from "@/scanner/lookup";
import { NameIndex } from "@/scanner/names";
import type { OcrEngine, OcrOptions } from "@/scanner/ocr";
import { fakeCard } from "./scanner-helpers";

const netBytes = fs.readFileSync(path.join("scanner-data", "art-net.bin"));

describe("art network", () => {
  const net = new ArtNet(netBytes);

  it("gives the same numbers as the original network (Keras), within half-precision rounding", () => {
    const ref: number[] = JSON.parse(fs.readFileSync(path.join("tests", "fixtures", "art-net-ref.json"), "utf8")).output;
    const rgba = new Uint8ClampedArray(net.width * net.height * 4);
    for (let y = 0; y < net.height; y++)
      for (let x = 0; x < net.width; x++)
        for (let c = 0; c < 4; c++) rgba[(y * net.width + x) * 4 + c] = c === 3 ? 255 : (x * 7 + y * 13 + c * 50 + ((x * y) % 31) * 3) % 256;
    const out = net.embed(rgba);
    expect(out.length).toBe(ref.length);
    let dot = 0, a = 0, b = 0, worst = 0;
    out.forEach((v, i) => {
      dot += v * ref[i];
      a += v * v;
      b += ref[i] * ref[i];
      worst = Math.max(worst, Math.abs(v - ref[i]));
    });
    expect(dot / Math.sqrt(a * b)).toBeGreaterThan(0.9999);
    expect(worst).toBeLessThan(0.05);
  });

  it("sees the same art alike through blur and a colour cast, and different art apart", () => {
    const vec = (card: ReturnType<typeof fakeCard>) => {
      const f = net.embed(artInput(card, net.width, net.height).data);
      const v = Float32Array.from(f, (x) => Math.sqrt(Math.max(x, 0)));
      const n = Math.hypot(...v);
      return v.map((x) => x / n);
    };
    const cos = (a: Float32Array, b: Float32Array) => a.reduce((s, x, i) => s + x * b[i], 0);
    const card = fakeCard(3, 630, 880);
    // Warmer, a little darker and soft (a phone photo under room light).
    const photo = resizeRGBA(resizeRGBA(fakeCard(3, 630, 880), 160, 220), 630, 880);
    for (let i = 0; i < photo.data.length; i += 4) {
      photo.data[i] = Math.min(255, photo.data[i] * 1.1 + 8);
      photo.data[i + 2] = photo.data[i + 2] * 0.85;
    }
    const same = cos(vec(card), vec(photo));
    for (const seed of [2, 5, 11]) expect(same).toBeGreaterThan(cos(vec(card), vec(fakeCard(seed, 630, 880))) + 0.05);
  });
});

describe("picture index", () => {
  const F = 8;
  const D = 4;
  const ids = ["00000000-0000-4000-8000-000000000001", "00000000-0000-4000-8000-000000000002", "00000000-0000-4000-8000-0000000000ff"];
  const unit = (v: number[]) => {
    const n = Math.hypot(...v);
    return v.map((x) => x / n);
  };
  const vectors = Float32Array.from([...unit([1, 0, 0, 0.2]), ...unit([0, 1, 0, 0.2]), ...unit([0.7, 0.7, 0.1, 0])]);
  const projection = new Float32Array(F * D);
  for (let i = 0; i < D; i++) projection[i * D + i] = 1;
  const index = new ArtIndex(encodeArtIndex({ net: "test", mean: new Float32Array(F), projection, ids, vectors }));

  it("reads back what was written", () => {
    expect(index.size).toBe(3);
    expect(index.header).toMatchObject({ net: "test", features: F, dims: D });
    expect([0, 1, 2].map((r) => index.id(r))).toEqual(ids);
  });

  it("finds the closest printings, best first, with cosine similarity", () => {
    const hits = index.search(Float32Array.from(unit([1, 0.1, 0, 0.2])), 2);
    expect(hits.map((h) => h.id)).toEqual([ids[0], ids[2]]);
    expect(hits[0].similarity).toBeGreaterThan(0.98);
    expect(hits[0].similarity).toBeLessThanOrEqual(1.01);
  });

  it("projects network features to unit vectors", () => {
    const v = projectFeatures(Float32Array.from([4, 9, 0, 1, 0, 0, 0, 0]), new Float32Array(F), projection, D);
    expect(Math.hypot(...v)).toBeCloseTo(1, 5);
    expect(v[1]).toBeGreaterThan(v[0]); // square roots: 3 > 2
  });
});

/** OCR stand-in: scripted text per pass; counts how often the title was read. */
function fakeOcr(name: string, collector = "") {
  const calls = { title: 0, collector: 0 };
  const ocr: OcrEngine = {
    async recognize(_img, opts: OcrOptions) {
      const isCopyright = !!opts.whitelist?.includes("&") && !opts.whitelist.includes("'");
      const isCollector = !isCopyright && opts.whitelist?.includes("/") && !opts.whitelist.includes("a");
      if (isCollector) calls.collector++;
      else if (!isCopyright) calls.title++;
      return { text: isCopyright ? "" : isCollector ? collector : name, confidence: 80 };
    },
    async terminate() {},
  };
  return { ocr, calls };
}

describe("identifyCard, picture first", () => {
  const p = (id: string, name: string, set: string, cn: string): Printing => ({
    scryfallId: id,
    name,
    set,
    setName: set.toUpperCase(),
    collectorNumber: cn,
    lang: "en",
    rarity: "rare",
    finishes: ["nonfoil", "foil"],
    imageNormal: `img:${id}`,
  });
  // Sol Ring in two sets with the same art, one with new art; Mind Stone looks a bit alike.
  const prints = [p("a", "Sol Ring", "c20", "252"), p("b", "Sol Ring", "c21", "263"), p("c", "Sol Ring", "cmm", "410"), p("m", "Mind Stone", "c21", "250")];
  const lookup: CardLookup = {
    async printingsByName(name) {
      return prints.filter((x) => x.name === name);
    },
    async bySetAndNumber(set, cn) {
      return prints.find((x) => x.set === set.toLowerCase() && x.collectorNumber === cn) ?? null;
    },
    async byIds(ids) {
      return prints.filter((x) => ids.includes(x.scryfallId));
    },
  };
  const art: Record<string, number> = { a: 1, b: 1, c: 7, m: 4 };
  const deps = (opts: { name?: string; collector?: string; sims: Record<string, number> }) => {
    const { ocr, calls } = fakeOcr(opts.name ?? "", opts.collector ?? "");
    let namesLoaded = 0;
    const d: RecognizerDeps = {
      ocr,
      names: async () => {
        namesLoaded++;
        return new NameIndex(["Sol Ring", "Mind Stone"]);
      },
      lookup,
      art: () => Object.entries(opts.sims).map(([id, similarity]) => ({ id, similarity })).sort((x, y) => y.similarity - x.similarity),
      loadImage: async (url) => fakeCard(art[url.slice(4)], 630, 880),
      hashCache: new Map(),
    };
    return { d, calls, namesLoaded: () => namesLoaded };
  };

  it("names the card from the picture and reads only the collector line for the edition", async () => {
    const { d, calls, namesLoaded } = deps({ collector: "263/300 R\nC21 • EN", sims: { a: 0.8, b: 0.79, c: 0.55, m: 0.5 } });
    const res = await identifyCard(fakeCard(1, 630, 880), d);
    expect(res.status).toBe("matched");
    expect(res.best?.printing.scryfallId).toBe("b");
    expect(res.lang).toBe("en");
    expect(res.art).toMatchObject({ name: "Sol Ring", sure: true });
    expect(calls.title).toBe(0);
    expect(namesLoaded()).toBe(0);
  });

  it("checks the title is English when the collector line doesn't say", async () => {
    const { d, calls } = deps({ name: "Sol Ring", collector: "", sims: { c: 0.8, a: 0.6, b: 0.6, m: 0.5 } });
    const res = await identifyCard(fakeCard(7, 630, 880), d);
    expect(res.best?.printing.scryfallId).toBe("c");
    expect(res.lang).toBe("en");
    expect(res.status).toBe("matched");
    expect(calls.title).toBe(1);
  });

  it("asks before adding a card only the picture vouches for (no collector line, title unreadable)", async () => {
    const { d } = deps({ name: "~~ ##", collector: "", sims: { c: 0.62, a: 0.45, b: 0.45, m: 0.5 } });
    const res = await identifyCard(fakeCard(7, 630, 880), d);
    expect(res.best?.printing.scryfallId).toBe("c");
    expect(res.status).toBe("uncertain");
  });

  it("asks which edition when reprints share the art and nothing tells them apart", async () => {
    const { d } = deps({ name: "Sol Ring", sims: { a: 0.8, b: 0.8, c: 0.55, m: 0.5 } });
    const res = await identifyCard(fakeCard(1, 630, 880), d);
    expect(["a", "b"]).toContain(res.best?.printing.scryfallId);
    expect(res.status).toBe("uncertain");
  });

  it("reads the card when the picture isn't clear-cut, and takes a title spelling the picture agrees with", async () => {
    const { d, namesLoaded } = deps({ name: "Mlnd St0ne", collector: "", sims: { m: 0.6, a: 0.56, b: 0.55 } });
    const res = await identifyCard(fakeCard(4, 630, 880), d);
    expect(res.art?.sure).toBe(false);
    expect(namesLoaded()).toBe(1);
    expect(res.name?.name).toBe("Mind Stone");
    expect(res.best?.printing.scryfallId).toBe("m");
  });

  it("reads the card in full when the collector line names a different card", async () => {
    const { d } = deps({ name: "Mind Stone", collector: "250/300 U\nC21 • EN", sims: { a: 0.7, b: 0.7, m: 0.5 } });
    const res = await identifyCard(fakeCard(4, 630, 880), d);
    expect(res.best?.printing.scryfallId).toBe("m");
  });
});
