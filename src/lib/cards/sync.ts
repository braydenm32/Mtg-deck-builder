import fs from "node:fs";
import readline from "node:readline";
import { Readable } from "node:stream";
import zlib from "node:zlib";
import streamArray from "stream-json/streamers/stream-array.js";
import { eq, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { meta } from "@/db/schema";
import { listBulkData, USER_AGENT, type ScryfallCard } from "@/lib/scryfall/client";
import { toCardRow, toPrintingRow, type CardRow, type PrintingRow } from "./rows";
import { upsertCards, upsertPrintings } from "./store";
import { clearMatchCaches } from "./match";

/**
 * Bulk files we load:
 * - oracle_cards: one object per gameplay card -> `cards`
 * - default_cards: every paper/digital printing in English (or its only language) -> `printings`
 * Non-English printings outside default_cards are fetched on demand when a collection needs them.
 */
export type BulkType = "oracle_cards" | "default_cards";

export type SyncProgress = (msg: string) => void;

/** Wrap a byte stream so gzip data (magic bytes 1f 8b) is decompressed and plain data passes through. */
async function maybeGunzip(input: Readable): Promise<Readable> {
  const iterator = input[Symbol.asyncIterator]();
  const first = await iterator.next();
  if (first.done) return Readable.from([]);
  const head = Buffer.from(first.value);
  async function* rest() {
    yield head;
    for (let r = await iterator.next(); !r.done; r = await iterator.next()) yield r.value;
  }
  const joined = Readable.from(rest());
  return head[0] === 0x1f && head[1] === 0x8b ? joined.pipe(zlib.createGunzip()) : joined;
}

/**
 * Stream card objects from a bulk file: a URL or local path, JSON array or JSON Lines,
 * optionally gzipped. Scryfall currently serves `.jsonl.gz`; older dumps were JSON arrays.
 */
export async function* readBulk(source: string): AsyncGenerator<ScryfallCard> {
  let raw: Readable;
  if (/^https?:/.test(source)) {
    const res = await fetch(source, { headers: { "User-Agent": USER_AGENT, Accept: "*/*" } });
    if (!res.ok || !res.body) throw new Error(`Download failed (${res.status}) for ${source}`);
    raw = Readable.fromWeb(res.body as import("node:stream/web").ReadableStream);
  } else {
    raw = fs.createReadStream(source);
  }
  const input = await maybeGunzip(raw);

  // Peek at the first non-space character: "[" means a JSON array, anything else JSON Lines.
  const iterator = input[Symbol.asyncIterator]();
  let first = await iterator.next();
  while (!first.done && Buffer.from(first.value).toString("utf8").trim() === "") first = await iterator.next();
  if (first.done) return;
  const head = Buffer.from(first.value);
  async function* rest() {
    yield head;
    for (let r = await iterator.next(); !r.done; r = await iterator.next()) yield r.value;
  }
  const body = Readable.from(rest());

  if (head.toString("utf8").trimStart().startsWith("[")) {
    const items = body.pipe(streamArray.withParserAsStream());
    for await (const item of items as AsyncIterable<{ value: ScryfallCard }>) yield item.value;
    return;
  }
  const lines = readline.createInterface({ input: body, crlfDelay: Infinity });
  for await (const line of lines) {
    const t = line.trim();
    if (t) yield JSON.parse(t) as ScryfallCard;
  }
}

async function loadInto<Row>(
  db: Db,
  source: string,
  toRow: (c: ScryfallCard, now: string) => Row | undefined,
  write: (tx: Parameters<Parameters<Db["transaction"]>[0]>[0], rows: Row[]) => Promise<void>,
  keep: (c: ScryfallCard) => boolean,
  progress: SyncProgress,
  label: string,
  seen?: (c: ScryfallCard) => void,
): Promise<number> {
  const now = new Date().toISOString();
  let count = 0;
  let buffer: Row[] = [];
  await db.transaction(async (tx) => {
    for await (const card of readBulk(source)) {
      if (!keep(card)) continue;
      seen?.(card);
      const row = toRow(card, now);
      if (!row) continue;
      buffer.push(row);
      if (buffer.length >= 2000) {
        await write(tx, buffer);
        count += buffer.length;
        buffer = [];
        if (count % 20000 === 0) progress(`${label}: ${count.toLocaleString()} rows`);
      }
    }
    if (buffer.length) {
      await write(tx, buffer);
      count += buffer.length;
    }
  });
  progress(`${label}: ${count.toLocaleString()} rows done`);
  return count;
}

/** Paper printings only: Arena/MTGO-only printings can't be in a physical collection. */
const isPaper = (c: ScryfallCard) => !c.digital;
const all = () => true;

export type SyncOptions = {
  /** Use local files instead of downloading (paths to oracle_cards / default_cards JSON). */
  files?: Partial<Record<BulkType, string>>;
  /** Skip a download if the stored copy is at least this fresh. */
  maxAgeHours?: number;
  progress?: SyncProgress;
};

export async function syncCards(db: Db, opts: SyncOptions = {}) {
  const progress = opts.progress ?? (() => {});
  const sources: Record<BulkType, { uri: string; updatedAt: string }> = {} as never;

  if (opts.files?.oracle_cards && opts.files?.default_cards) {
    for (const t of ["oracle_cards", "default_cards"] as const) {
      sources[t] = { uri: opts.files[t]!, updatedAt: new Date().toISOString() };
    }
  } else {
    const list = await listBulkData();
    for (const t of ["oracle_cards", "default_cards"] as const) {
      const item = list.find((b) => b.type === t);
      if (!item) throw new Error(`Scryfall bulk-data has no ${t} entry`);
      const uri = opts.files?.[t] ?? item.jsonl_download_uri ?? item.download_uri;
      if (!uri) throw new Error(`Scryfall bulk-data entry ${t} has no download URL`);
      sources[t] = { uri, updatedAt: item.updated_at };
    }
  }

  const results: Record<string, number | "fresh"> = {};
  // Oracle cards whose representative printing is digital (e.g. Lotus Petal from Tempest Remastered).
  // We keep every oracle card, then take their image from a paper printing below.
  const digitalRepresentative: string[] = [];
  const noteDigital = (c: ScryfallCard) => {
    if (c.digital) {
      const id = c.oracle_id ?? c.card_faces?.[0]?.oracle_id;
      if (id) digitalRepresentative.push(id);
    }
  };
  for (const t of ["oracle_cards", "default_cards"] as const) {
    const key = `bulk:${t}:updated_at`;
    const [stored] = await db.select().from(meta).where(eq(meta.key, key));
    if (stored && opts.maxAgeHours !== undefined) {
      const ageH = (Date.now() - Date.parse(stored.value)) / 3_600_000;
      if (stored.value === sources[t].updatedAt || ageH < opts.maxAgeHours) {
        progress(`${t}: already up to date (${stored.value})`);
        results[t] = "fresh";
        continue;
      }
    }
    progress(`${t}: loading from ${sources[t].uri}`);
    results[t] =
      t === "oracle_cards"
        ? await loadInto<CardRow>(db, sources[t].uri, toCardRow, upsertCards, all, progress, t, noteDigital)
        : await loadInto<PrintingRow>(db, sources[t].uri, toPrintingRow, upsertPrintings, isPaper, progress, t);
    await db
      .insert(meta)
      .values({ key, value: sources[t].updatedAt })
      .onConflictDoUpdate({ target: meta.key, set: { value: sources[t].updatedAt } });
  }

  clearMatchCaches(db);

  await db.run(sql`UPDATE cards SET paper = EXISTS (SELECT 1 FROM printings p WHERE p.oracle_id = cards.oracle_id)`);
  for (let i = 0; i < digitalRepresentative.length; i += 500) {
    const ids = digitalRepresentative.slice(i, i + 500);
    await db.run(sql`
      UPDATE cards SET
        image_normal = COALESCE((SELECT p.image_normal FROM printings p WHERE p.oracle_id = cards.oracle_id AND p.lang = 'en'
                                 ORDER BY p.released_at DESC LIMIT 1), image_normal),
        image_small = COALESCE((SELECT p.image_small FROM printings p WHERE p.oracle_id = cards.oracle_id AND p.lang = 'en'
                                ORDER BY p.released_at DESC LIMIT 1), image_small)
      WHERE oracle_id IN (${sql.join(ids.map((id) => sql`${id}`), sql`, `)})`);
  }

  // Cheapest printing price per card, for "missing cards" costs later.
  await db.run(sql`
    UPDATE cards SET price_usd = (
      SELECT MIN(COALESCE(p.price_usd, p.price_usd_foil, p.price_usd_etched))
      FROM printings p WHERE p.oracle_id = cards.oracle_id
    )
    WHERE EXISTS (SELECT 1 FROM printings p WHERE p.oracle_id = cards.oracle_id)`);

  return results;
}

export async function lastSync(db: Db): Promise<string | undefined> {
  const [row] = await db.select().from(meta).where(eq(meta.key, "bulk:default_cards:updated_at"));
  return row?.value;
}
