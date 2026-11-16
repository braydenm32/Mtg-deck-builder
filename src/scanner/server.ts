/**
 * Server-side wiring for the recogniser: Tesseract.js in Node, the local card
 * database for names and printings, and sharp for decoding images.
 *
 * Recognition runs on the server so the phone only has to find the card and
 * send one JPEG, and so the exact same code path is what the tests measure.
 *
 * Server only: imports sharp and Tesseract's Node worker.
 */
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import sharp from "sharp";
import { createWorker } from "tesseract.js";
import type { Db } from "@/db/client";
import { allCardNames, printingsByName, printingsByNumberAndTotal, printingsBySetNumber, type Printing as DbPrinting } from "@/lib/cards/lookup";
import type { RGBAImage } from "./image";
import type { ImageHashes, RecognizerDeps } from "./identify";
import type { CardLookup, Printing } from "./lookup";
import { NameIndex } from "./names";
import { type OcrEngine, tesseractEngine, type TesseractWorkerLike } from "./ocr";

const UA = "mtg-deck-builder/0.1 (personal collection app)";

export async function decodeImage(input: Buffer | Uint8Array): Promise<RGBAImage> {
  const { data, info } = await sharp(input).rotate().ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { width: info.width, height: info.height, data: new Uint8ClampedArray(data.buffer, data.byteOffset, data.length) };
}

export function toScannerPrinting(p: DbPrinting): Printing {
  return {
    scryfallId: p.id,
    oracleId: p.oracleId,
    name: p.name,
    set: p.setCode,
    setName: p.setName,
    collectorNumber: p.collectorNumber,
    lang: p.lang,
    releasedAt: p.releasedAt ?? undefined,
    rarity: p.rarity,
    finishes: p.finishes,
    variantRank: p.variantRank,
    promo: p.setType === "promo",
    imageNormal: p.imageNormal ?? undefined,
    imageSmall: p.imageSmall ?? undefined,
    prices: { nonfoil: p.priceUsd, foil: p.priceUsdFoil, etched: p.priceUsdEtched },
  };
}

/** CardLookup over the app's own card database (filled by the card data download). */
export class LocalCardLookup implements CardLookup {
  constructor(private readonly db: Db) {}

  async printingsByName(name: string, opts: { lang?: string } = {}): Promise<Printing[]> {
    const lang = opts.lang ?? "en";
    const rows = await printingsByName(this.db, name);
    // Keep the requested language, but fall back to everything if a card only exists in others.
    const inLang = rows.filter((p) => p.lang === lang);
    return (inLang.length ? inLang : rows).map(toScannerPrinting);
  }

  async bySetAndNumber(set: string, collectorNumber: string, lang?: string): Promise<Printing | null> {
    const rows = await printingsBySetNumber(this.db, set, collectorNumber);
    const pick = rows.find((p) => p.lang === (lang ?? "en")) ?? rows.find((p) => p.lang === "en") ?? rows[0];
    return pick ? toScannerPrinting(pick) : null;
  }

  async byNumberAndTotal(collectorNumber: string, setTotal: number): Promise<Printing[]> {
    const rows = await printingsByNumberAndTotal(this.db, collectorNumber, setTotal);
    return rows.filter((p) => p.lang === "en").map(toScannerPrinting);
  }
}

/** A tiny LRU so long scanning sessions don't grow memory forever. */
class Lru<K, V> extends Map<K, V> {
  constructor(private readonly max: number) {
    super();
  }
  override get(k: K): V | undefined {
    const v = super.get(k);
    if (v !== undefined) {
      super.delete(k);
      super.set(k, v);
    }
    return v;
  }
  override set(k: K, v: V): this {
    super.delete(k);
    super.set(k, v);
    while (this.size > this.max) super.delete(this.keys().next().value as K);
    return this;
  }
}

async function loadRemoteImage(url: string): Promise<RGBAImage> {
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`Image fetch failed (${res.status})`);
  return decodeImage(Buffer.from(await res.arrayBuffer()));
}

interface ScannerState {
  ocr: Promise<OcrEngine>;
  names?: { index: NameIndex; size: number; builtAt: number };
  hashCache: Map<string, Promise<ImageHashes | null>>;
}

// Survives Next.js dev hot reloads, so the OCR worker isn't re-created per edit.
const g = globalThis as typeof globalThis & { __mtgScanner?: ScannerState };

function tessdataDir(): string {
  const dir = path.join(process.cwd(), "node_modules", "@tesseract.js-data", "eng", "4.0.0_best_int");
  if (!fs.existsSync(dir)) throw new Error("OCR language data missing: run npm install");
  return dir;
}

function state(): ScannerState {
  if (!g.__mtgScanner) {
    // Serverless hosts (Vercel) only allow writing to the temp folder.
    const cachePath = process.env.VERCEL ? path.join(os.tmpdir(), "tesseract-cache") : path.join(process.cwd(), "data", "tesseract-cache");
    fs.mkdirSync(cachePath, { recursive: true });
    const ocr = createWorker("eng", 1, { langPath: tessdataDir(), gzip: true, cachePath }).then((w) =>
      tesseractEngine(w as unknown as TesseractWorkerLike, (bmp) => Buffer.from(bmp)),
    );
    ocr.catch(() => {
      // Let the next request try again.
      if (g.__mtgScanner?.ocr === ocr) delete g.__mtgScanner;
    });
    g.__mtgScanner = { ocr, hashCache: new Lru(4000) };
  }
  return g.__mtgScanner;
}

const NAME_INDEX_TTL_MS = 10 * 60 * 1000;

async function nameIndex(db: Db): Promise<NameIndex> {
  const s = state();
  if (s.names && Date.now() - s.names.builtAt < NAME_INDEX_TTL_MS) return s.names.index;
  const rows = await allCardNames(db);
  // Before the first card download there's nothing to index; look again on the next scan.
  if (!rows.length) return new NameIndex([]);
  if (!s.names || s.names.size !== rows.length) {
    s.names = { index: new NameIndex(rows.map((r) => r.name)), size: rows.length, builtAt: Date.now() };
  } else {
    s.names.builtAt = Date.now();
  }
  return s.names.index;
}

export class NoCardDataError extends Error {
  constructor() {
    super("No card data yet. Open Today to download it, then scan again.");
  }
}

export async function getRecognizerDeps(db: Db): Promise<RecognizerDeps> {
  const s = state();
  const names = await nameIndex(db);
  if (!names.size) throw new NoCardDataError();
  return {
    ocr: await s.ocr,
    names,
    lookup: new LocalCardLookup(db),
    loadImage: loadRemoteImage,
    hashCache: s.hashCache,
  };
}
