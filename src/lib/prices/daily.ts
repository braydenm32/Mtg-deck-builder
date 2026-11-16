/**
 * Daily prices for the cards you own, inside the free database plan.
 *
 * The weekly card download refreshes every printing's price. Between downloads, this asks Scryfall
 * for just the printings in your collection (75 per call) and writes only the ones whose price
 * changed: the printing itself, the price check's last look (price_seen) and one history row with
 * the price before and after. Once a day it also records the collection's total, and works out
 * the week's biggest movers so pages read them from one row.
 *
 * A pass runs after a page has gone out (the Today page starts it). It stops after a time budget
 * and the next visit carries on from where it got to, so a large collection never holds a request.
 */
import { eq, inArray, lt, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import type { Db } from "@/db/client";
import { meta, priceHistory, priceSeen, printings, valueHistory } from "@/db/schema";
import { cardDataState } from "@/lib/cards/refresh";
import { collectionTotals } from "@/lib/collection/query";
import { fetchCollection, type ScryfallCard } from "@/lib/scryfall/client";
import { fireAlerts } from "./alerts";

const DONE = "prices:done";
const CURSOR = "prices:cursor";
const LOCK = "prices:running";
export const MOVERS = "prices:movers";
/** Scryfall publishes prices once a day. */
export const PRICE_REFRESH_HOURS = 20;
const LOCK_STALE_MS = 3 * 60 * 1000;
/** Printings asked for per round: four calls to Scryfall, about two seconds. */
const CHUNK = 300;
/** Price history older than this is pruned. */
const KEEP_DAYS = 400;
const MOVER_DAYS = 7;
/** A change smaller than this (US$, across your copies) isn't a mover. */
const MOVER_MIN_USD = 1;

type Prices = { usd: number | null; usdFoil: number | null; usdEtched: number | null };

export type PriceState = {
  /** When the last full pass finished. */
  done?: string;
  /** A pass is under way (since this time). */
  runningSince?: string;
  /** An unfinished pass has got this far. */
  partway: boolean;
};

export type Mover = {
  oracleId: string;
  printingId: string;
  name: string;
  setCode: string;
  finish: string;
  copies: number;
  imageSmall: string | null;
  /** Price of one copy a week ago and now (US$). */
  was: number;
  now: number;
  /** now − was, times your copies (US$). */
  change: number;
};

export type Movers = {
  at: string;
  days: number;
  up: Mover[];
  down: Mover[];
  /** What price changes alone did to the collection's value over the period (US$). */
  total: number;
};

const day = (d: Date) => d.toISOString().slice(0, 10);

async function metaValue(db: Db, key: string): Promise<string | undefined> {
  const [row] = await db.select().from(meta).where(eq(meta.key, key));
  return row?.value;
}

const setMeta = (db: Db, key: string, value: string) =>
  db.insert(meta).values({ key, value }).onConflictDoUpdate({ target: meta.key, set: { value } });

export async function priceState(db: Db): Promise<PriceState> {
  const rows = await db.select().from(meta).where(inArray(meta.key, [DONE, CURSOR, LOCK]));
  const get = (k: string) => rows.find((r) => r.key === k)?.value;
  const running = get(LOCK);
  const live = running && Date.now() - Date.parse(running) < LOCK_STALE_MS ? running : undefined;
  return { done: get(DONE), runningSince: live, partway: get(CURSOR) != null };
}

/** Time for a price check: none today, or the last one stopped partway. */
export function pricesDue(s: PriceState, now = Date.now()): boolean {
  if (s.runningSince) return false;
  if (s.partway) return true;
  return !s.done || now - Date.parse(s.done) > PRICE_REFRESH_HOURS * 3_600_000;
}

/** One copy's price in a finish, by the same rule as the collection's totals (STACK_PRICE). */
export function finishPrice(p: Prices, finish: string): number | null {
  if (finish === "foil") return p.usdFoil ?? p.usd;
  if (finish === "etched") return p.usdEtched ?? p.usdFoil ?? p.usd;
  return p.usd ?? p.usdFoil;
}

const num = (v: string | null | undefined) => {
  const n = v == null ? NaN : Number(v);
  return Number.isFinite(n) ? n : null;
};

const pricesOf = (c: ScryfallCard): Prices & { eur: number | null; eurFoil: number | null } => ({
  usd: num(c.prices?.usd),
  usdFoil: num(c.prices?.usd_foil),
  usdEtched: num(c.prices?.usd_etched),
  eur: num(c.prices?.eur),
  eurFoil: num(c.prices?.eur_foil),
});

const same = (a: Prices, b: Prices) => a.usd === b.usd && a.usdFoil === b.usdFoil && a.usdEtched === b.usdEtched;

async function lock(db: Db): Promise<boolean> {
  const now = new Date().toISOString();
  const stale = new Date(Date.now() - LOCK_STALE_MS).toISOString();
  const r = await db.run(sql`
    INSERT INTO meta (key, value) VALUES (${LOCK}, ${now})
    ON CONFLICT (key) DO UPDATE SET value = excluded.value WHERE meta.value < ${stale}`);
  return r.rowsAffected > 0;
}

export type PriceRefresh =
  | { started: false; reason: "running" | "card-download" }
  | { started: true; done: boolean; checked: number; changed: number };

/**
 * Check today's prices for the printings you own, for up to `budgetMs`. `done` is false when time
 * ran out; the next call carries on from there. Callers decide whether a check is due (pricesDue).
 */
export async function refreshPrices(
  db: Db,
  opts: { budgetMs?: number; fetcher?: typeof fetchCollection; now?: () => Date } = {},
): Promise<PriceRefresh> {
  const { budgetMs = 40_000, fetcher = fetchCollection } = opts;
  const clock = opts.now ?? (() => new Date());
  if ((await cardDataState(db)).runningSince) return { started: false, reason: "card-download" };
  if (!(await lock(db))) return { started: false, reason: "running" };
  const start = Date.now();
  let checked = 0;
  let changed = 0;
  try {
    const cursor = (await metaValue(db, CURSOR)) ?? "";
    const ids = (
      // The printings you own, and the ones a waiting price alert watches (alerts.ts).
      await db.all<{ id: string }>(sql`
        SELECT id FROM (SELECT printing_id AS id FROM collection_items UNION SELECT printing_id FROM price_alerts WHERE fired_at IS NULL)
        WHERE id > ${cursor} ORDER BY id`)
    ).map((r) => r.id);

    for (let i = 0; i < ids.length; i += CHUNK) {
      if (i > 0 && Date.now() - start > budgetMs) {
        await fireAlerts(db, clock());
        return { started: true, done: false, checked, changed };
      }
      const chunk = ids.slice(i, i + CHUNK);
      const now = clock();
      const { data } = await fetcher(chunk.map((id) => ({ id })));
      const [seen, current] = await Promise.all([
        db.select().from(priceSeen).where(inArray(priceSeen.printingId, chunk)),
        db
          .select({ id: printings.id, usd: printings.priceUsd, usdFoil: printings.priceUsdFoil, usdEtched: printings.priceUsdEtched, eur: printings.priceEur, eurFoil: printings.priceEurFoil })
          .from(printings)
          .where(inArray(printings.id, chunk)),
      ]);
      const seenBy = new Map(seen.map((s) => [s.printingId, s]));
      const currentBy = new Map(current.map((p) => [p.id, p]));
      const statements: BatchItem<"sqlite">[] = [];
      for (const c of data) {
        const cur = currentBy.get(c.id);
        if (!cur) continue;
        checked++;
        const p = pricesOf(c);
        // The card download may have moved the printing already: the last look is what history compares with.
        const before = seenBy.get(c.id) ?? cur;
        if (!same(p, cur) || p.eur !== cur.eur || p.eurFoil !== cur.eurFoil)
          statements.push(db.update(printings).set({ priceUsd: p.usd, priceUsdFoil: p.usdFoil, priceUsdEtched: p.usdEtched, priceEur: p.eur, priceEurFoil: p.eurFoil }).where(eq(printings.id, c.id)));
        const moved = !same(p, before);
        if (seenBy.has(c.id) && !moved) continue;
        const look = { usd: p.usd, usdFoil: p.usdFoil, usdEtched: p.usdEtched, seenAt: now.toISOString() };
        statements.push(db.insert(priceSeen).values({ printingId: c.id, ...look }).onConflictDoUpdate({ target: priceSeen.printingId, set: look }));
        // A first look at an unchanged price needs no history row: history is the days it changed.
        if (!moved) continue;
        changed++;
        const row = { usd: p.usd, usdFoil: p.usdFoil, usdEtched: p.usdEtched };
        statements.push(
          db
            .insert(priceHistory)
            .values({ printingId: c.id, date: day(now), ...row, wasUsd: before.usd, wasUsdFoil: before.usdFoil, wasUsdEtched: before.usdEtched })
            // A second check the same day keeps the day's starting price.
            .onConflictDoUpdate({ target: [priceHistory.printingId, priceHistory.date], set: row }),
        );
      }
      statements.push(setMeta(db, CURSOR, chunk[chunk.length - 1]));
      const [first, ...rest] = statements;
      await db.batch([first, ...rest]);
    }

    const now = clock();
    await recordValue(db, now);
    await db.delete(priceHistory).where(lt(priceHistory.date, day(new Date(now.getTime() - KEEP_DAYS * 86_400_000))));
    const movers = await computeMovers(db, now);
    await db.batch([setMeta(db, MOVERS, JSON.stringify(movers)), setMeta(db, DONE, now.toISOString()), db.delete(meta).where(eq(meta.key, CURSOR))]);
    await fireAlerts(db, now);
    return { started: true, done: true, checked, changed };
  } finally {
    await db.delete(meta).where(eq(meta.key, LOCK)).catch(() => {});
  }
}

/** Today's total, one row per day (a second check the same day replaces it). */
export async function recordValue(db: Db, now = new Date()) {
  const t = await collectionTotals(db);
  const row = { usd: t.value, copies: t.copies };
  await db.insert(valueHistory).values({ date: day(now), ...row }).onConflictDoUpdate({ target: valueHistory.date, set: row });
}

/**
 * The cards whose value moved most over the last week, up and down. Reads only the week's history
 * rows: a printing with none didn't move. Guessed printings and proxies are left out, as in totals.
 */
export async function computeMovers(db: Db, now = new Date(), days = MOVER_DAYS, limit = 5): Promise<Movers> {
  const cutoff = day(new Date(now.getTime() - days * 86_400_000));
  const rows = await db
    .select({ id: priceHistory.printingId, date: priceHistory.date, usd: priceHistory.wasUsd, usdFoil: priceHistory.wasUsdFoil, usdEtched: priceHistory.wasUsdEtched })
    .from(priceHistory)
    .where(sql`${priceHistory.date} > ${cutoff}`)
    .orderBy(priceHistory.date);
  const was = new Map<string, Prices>();
  for (const r of rows) if (!was.has(r.id)) was.set(r.id, r);
  const out: Movers = { at: now.toISOString(), days, up: [], down: [], total: 0 };
  if (!was.size) return out;
  const ids = [...was.keys()];
  const stacks: { printing_id: string; finish: string; copies: number; oracle_id: string; name: string; set_code: string; image_small: string | null; usd: number | null; usd_foil: number | null; usd_etched: number | null }[] = [];
  for (let i = 0; i < ids.length; i += 400) {
    const chunk = ids.slice(i, i + 400);
    stacks.push(
      ...(await db.all<(typeof stacks)[number]>(sql`
        SELECT ci.printing_id, ci.finish, SUM(ci.quantity) AS copies, p.oracle_id, p.name, p.set_code, p.image_small,
               p.price_usd AS usd, p.price_usd_foil AS usd_foil, p.price_usd_etched AS usd_etched
        FROM collection_items ci CROSS JOIN printings p ON p.id = ci.printing_id
        WHERE ci.printing_id IN (${sql.join(chunk.map((id) => sql`${id}`), sql`, `)})
          AND NOT ci.proxy AND ci.printing_confidence != 'guessed'
        GROUP BY ci.printing_id, ci.finish`)),
    );
  }
  const all: Mover[] = [];
  for (const s of stacks) {
    const before = finishPrice(was.get(s.printing_id)!, s.finish);
    const after = finishPrice({ usd: s.usd, usdFoil: s.usd_foil, usdEtched: s.usd_etched }, s.finish);
    if (before == null || after == null) continue;
    const copies = Number(s.copies);
    const change = Math.round((after - before) * copies * 100) / 100;
    out.total += change;
    if (Math.abs(change) < MOVER_MIN_USD) continue;
    all.push({ oracleId: s.oracle_id, printingId: s.printing_id, name: s.name, setCode: s.set_code, finish: s.finish, copies, imageSmall: s.image_small, was: before, now: after, change });
  }
  out.total = Math.round(out.total * 100) / 100;
  out.up = all.filter((m) => m.change > 0).sort((a, b) => b.change - a.change).slice(0, limit);
  out.down = all.filter((m) => m.change < 0).sort((a, b) => a.change - b.change).slice(0, limit);
  return out;
}

export async function readMovers(db: Db): Promise<Movers | undefined> {
  const v = await metaValue(db, MOVERS);
  if (!v) return undefined;
  try {
    return JSON.parse(v) as Movers;
  } catch {
    return undefined;
  }
}

/** The collection's daily totals, oldest first. */
export async function valueSeries(db: Db, days = 365) {
  const from = day(new Date(Date.now() - days * 86_400_000));
  return db.select().from(valueHistory).where(sql`${valueHistory.date} >= ${from}`).orderBy(valueHistory.date);
}

/** One printing's price on each day it changed, oldest first (for the card page). */
export async function printingHistory(db: Db, printingIds: string[]) {
  if (!printingIds.length) return [];
  return db.select().from(priceHistory).where(inArray(priceHistory.printingId, printingIds)).orderBy(priceHistory.date);
}
