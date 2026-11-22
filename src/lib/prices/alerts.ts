import { and, desc, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db/client";
import { cards, priceAlerts, printings } from "@/db/schema";
import { notifyPhones } from "@/lib/push";

/**
 * Price alerts: "tell me when Sol Ring drops below $1" (a card to buy) or "when my Doubling Season
 * rises above $60" (one to sell). Each alert watches one printing in one finish: the printing you
 * own, or else the cheapest regular English printing. The daily price check (daily.ts) looks at
 * those printings too and calls checkAlerts when it's done; an alert that goes off shows on Today,
 * and on your phone when notifications are on (src/lib/push.ts).
 */

export type Direction = "below" | "above";
export const FINISHES = ["nonfoil", "foil", "etched"] as const;
export type AlertFinish = (typeof FINISHES)[number];

/** Whether a price has crossed the line. A missing price never sets an alert off. */
export function alertMet(direction: Direction, line: number, price: number | null | undefined): boolean {
  if (price == null || !Number.isFinite(price)) return false;
  return direction === "below" ? price <= line : price >= line;
}

type PrintingPrices = { priceUsd: number | null; priceUsdFoil: number | null; priceUsdEtched: number | null };
/**
 * A printing's price in exactly that finish (no stand-in from another finish, unlike a collection
 * stack's value): an alert on a foil watches the foil price.
 */
function priceOf(p: PrintingPrices, finish: string): number | null {
  return finish === "foil" ? p.priceUsdFoil : finish === "etched" ? p.priceUsdEtched : p.priceUsd;
}

export type Quote = { oracleId: string; name: string; printingId: string; label: string; usd: number | null; owned: boolean };

/**
 * The printing an alert on this card watches, and its price now: the printing you have most copies
 * of, or else the cheapest regular English printing with a price in that finish.
 */
export async function quoteFor(db: Db, oracleId: string, finish: AlertFinish): Promise<Quote | undefined> {
  const [card] = await db.select({ name: cards.name }).from(cards).where(eq(cards.oracleId, oracleId));
  if (!card) return undefined;
  const [mine] = await db.all<{ printing_id: string }>(sql`
    SELECT printing_id FROM collection_items WHERE oracle_id = ${oracleId} AND NOT proxy
    GROUP BY printing_id ORDER BY SUM(CASE WHEN finish = ${finish} THEN quantity ELSE 0 END) DESC, SUM(quantity) DESC LIMIT 1`);
  const rows = await db
    .select({ id: printings.id, setCode: printings.setCode, collectorNumber: printings.collectorNumber, lang: printings.lang, variantRank: printings.variantRank, priceUsd: printings.priceUsd, priceUsdFoil: printings.priceUsdFoil, priceUsdEtched: printings.priceUsdEtched })
    .from(printings)
    .where(eq(printings.oracleId, oracleId))
    .orderBy(desc(printings.releasedAt));
  if (!rows.length) return undefined;
  let pick = mine ? rows.find((r) => r.id === mine.printing_id) : undefined;
  if (!pick) {
    const priced = rows.filter((r) => priceOf(r, finish) != null);
    const pool = priced.filter((r) => r.lang === "en" && !r.variantRank).length ? priced.filter((r) => r.lang === "en" && !r.variantRank) : priced.filter((r) => r.lang === "en").length ? priced.filter((r) => r.lang === "en") : priced;
    pick = pool.sort((a, b) => priceOf(a, finish)! - priceOf(b, finish)!)[0] ?? rows[0];
  }
  return { oracleId, name: card.name, printingId: pick.id, label: printingLabel(pick.setCode, pick.collectorNumber, finish), usd: priceOf(pick, finish), owned: !!mine && pick.id === mine.printing_id };
}

export const printingLabel = (setCode: string, number: string, finish: string) =>
  [`${setCode.toUpperCase()} #${number}`, finish === "foil" ? "Foil" : finish === "etched" ? "Etched" : ""].filter(Boolean).join(" · ");

export type NewAlert = { oracleId: string; finish: AlertFinish; direction: Direction; usd: number };

export async function createAlert(db: Db, input: NewAlert, now = new Date()): Promise<{ id: number } | { error: string }> {
  if (!(input.usd > 0)) return { error: "Set a price above zero." };
  const q = await quoteFor(db, input.oracleId, input.finish);
  if (!q) return { error: "That card isn’t in the card data." };
  if (alertMet(input.direction, input.usd, q.usd)) return { error: `It’s already ${input.direction === "below" ? "at or below" : "at or above"} that price.` };
  const [row] = await db
    .insert(priceAlerts)
    .values({ oracleId: input.oracleId, printingId: q.printingId, finish: input.finish, direction: input.direction, usd: Math.round(input.usd * 100) / 100, createdAt: now.toISOString() })
    .returning({ id: priceAlerts.id });
  return { id: row.id };
}

export async function deleteAlert(db: Db, id: number): Promise<boolean> {
  const r = await db.delete(priceAlerts).where(eq(priceAlerts.id, id)).returning({ id: priceAlerts.id });
  return r.length > 0;
}

export type AlertRow = {
  id: number;
  oracleId: string;
  name: string;
  imageSmall: string | null;
  label: string;
  direction: Direction;
  usd: number;
  /** The watched printing's price now (US$). */
  nowUsd: number | null;
  createdAt: string;
  firedAt: string | null;
  firedUsd: number | null;
};

/** Every alert: the ones that went off first (newest first), then the ones still watching. */
export async function listAlerts(db: Db, opts: { fired?: boolean } = {}): Promise<AlertRow[]> {
  const rows = await db
    .select({
      id: priceAlerts.id,
      oracleId: priceAlerts.oracleId,
      name: printings.name,
      imageSmall: printings.imageSmall,
      setCode: printings.setCode,
      collectorNumber: printings.collectorNumber,
      finish: priceAlerts.finish,
      direction: priceAlerts.direction,
      usd: priceAlerts.usd,
      priceUsd: printings.priceUsd,
      priceUsdFoil: printings.priceUsdFoil,
      priceUsdEtched: printings.priceUsdEtched,
      createdAt: priceAlerts.createdAt,
      firedAt: priceAlerts.firedAt,
      firedUsd: priceAlerts.firedUsd,
    })
    .from(priceAlerts)
    .innerJoin(printings, eq(printings.id, priceAlerts.printingId))
    .where(opts.fired ? isNotNull(priceAlerts.firedAt) : undefined)
    .orderBy(sql`${priceAlerts.firedAt} IS NULL`, desc(priceAlerts.firedAt), printings.name);
  return rows.map((r) => ({
    id: r.id,
    oracleId: r.oracleId,
    name: r.name,
    imageSmall: r.imageSmall,
    label: printingLabel(r.setCode, r.collectorNumber, r.finish),
    direction: r.direction,
    usd: r.usd,
    nowUsd: priceOf(r, r.finish),
    createdAt: r.createdAt,
    firedAt: r.firedAt,
    firedUsd: r.firedUsd,
  }));
}

/**
 * Set off every waiting alert whose printing has crossed its line, at the prices in the card data
 * now. Returns the ones that went off just now. Reads only the waiting alerts (a handful of rows).
 */
export async function checkAlerts(db: Db, now = new Date()): Promise<{ id: number; name: string; direction: Direction; usd: number; price: number }[]> {
  const waiting = await db
    .select({ id: priceAlerts.id, name: printings.name, finish: priceAlerts.finish, direction: priceAlerts.direction, usd: priceAlerts.usd, priceUsd: printings.priceUsd, priceUsdFoil: printings.priceUsdFoil, priceUsdEtched: printings.priceUsdEtched })
    .from(priceAlerts)
    .innerJoin(printings, eq(printings.id, priceAlerts.printingId))
    .where(isNull(priceAlerts.firedAt));
  const fired = waiting.flatMap((a) => {
    const price = priceOf(a, a.finish);
    return alertMet(a.direction, a.usd, price) ? [{ id: a.id, name: a.name, direction: a.direction, usd: a.usd, price: price! }] : [];
  });
  for (const f of fired) await db.update(priceAlerts).set({ firedAt: now.toISOString(), firedUsd: f.price }).where(and(eq(priceAlerts.id, f.id), isNull(priceAlerts.firedAt)));
  return fired;
}

/** After prices change (the daily check, the card download): alerts go off, and subscribed phones hear about it. Never throws. */
export async function fireAlerts(db: Db, now = new Date()): Promise<number> {
  try {
    const fired = await checkAlerts(db, now);
    if (fired.length) await notifyPhones(db);
    return fired.length;
  } catch (e) {
    console.error("[alerts]", e);
    return 0;
  }
}

/** One line for a notification or Today: "Sol Ring is down to US$1.20". */
export function alertLine(a: { name: string; direction: Direction }, price: string): string {
  return `${a.name} is ${a.direction === "below" ? "down" : "up"} to ${price}`;
}

export const newAlertSchema = z.object({
  oracleId: z.string().min(1).max(64),
  finish: z.enum(FINISHES).default("nonfoil"),
  direction: z.enum(["below", "above"]),
  usd: z.number().positive().max(1_000_000),
});

/** What a notification says: the alerts that went off in the last two days, newest first. */
export async function noticeFor(db: Db, price: (usd: number) => string, now = Date.now()): Promise<{ title: string; body: string; url: string }> {
  const since = new Date(now - 2 * 86_400_000).toISOString();
  const fired = (await listAlerts(db, { fired: true })).filter((a) => a.firedAt! >= since);
  if (!fired.length) return { title: "Price alert", body: "A card crossed your price. Open the app to see it.", url: "/collection/alerts" };
  const lines = fired.slice(0, 3).map((a) => alertLine(a, price(a.firedUsd ?? a.nowUsd ?? a.usd)));
  if (fired.length > 3) lines.push(`and ${fired.length - 3} more`);
  return { title: fired.length === 1 ? "Price alert" : `${fired.length} price alerts`, body: lines.join("\n"), url: "/collection/alerts" };
}
