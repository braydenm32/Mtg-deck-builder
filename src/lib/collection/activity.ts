import { and, desc, eq, gte, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { cards, collectionEvents, printings } from "@/db/schema";

/**
 * The collection's activity log (collection_events): what was added, removed, moved or sold, and
 * when. The service writes a line with each change (src/lib/collection/service.ts); an import is one
 * line for the whole file. Reading it never decides what you own.
 */

export type EventKind = (typeof collectionEvents.$inferSelect)["kind"];
export type NewEvent = { kind: EventKind; oracleId?: string | null; printingId?: string | null; quantity?: number; priceUsd?: number | null; detail?: string };

type Writer = Pick<Db, "insert">;

/** Write events (a no-op for none). Never fails the change it records. */
export async function logEvents(db: Writer, events: NewEvent[], now = new Date()) {
  if (!events.length) return;
  const at = now.toISOString();
  try {
    await db.insert(collectionEvents).values(
      events.map((e) => ({ at, kind: e.kind, oracleId: e.oracleId ?? null, printingId: e.printingId ?? null, quantity: e.quantity ?? 0, priceUsd: e.priceUsd ?? null, detail: e.detail ?? "" })),
    );
  } catch (e) {
    console.error("[activity]", e);
  }
}

export type ActivityRow = {
  id: number;
  at: string;
  kind: EventKind;
  oracleId: string | null;
  quantity: number;
  priceUsd: number | null;
  detail: string;
  name: string | null;
  setCode: string | null;
  collectorNumber: string | null;
  imageSmall: string | null;
};

/** The newest events first, optionally one kind. Joined to the card for its name and picture. */
export async function listActivity(db: Db, opts: { kind?: EventKind; limit?: number } = {}): Promise<ActivityRow[]> {
  return db
    .select({
      id: collectionEvents.id,
      at: collectionEvents.at,
      kind: collectionEvents.kind,
      oracleId: collectionEvents.oracleId,
      quantity: collectionEvents.quantity,
      priceUsd: collectionEvents.priceUsd,
      detail: collectionEvents.detail,
      name: cards.name,
      setCode: printings.setCode,
      collectorNumber: printings.collectorNumber,
      imageSmall: sql<string | null>`COALESCE(${printings.imageSmall}, ${cards.imageSmall})`,
    })
    .from(collectionEvents)
    .leftJoin(cards, eq(cards.oracleId, collectionEvents.oracleId))
    .leftJoin(printings, eq(printings.id, collectionEvents.printingId))
    .where(opts.kind ? eq(collectionEvents.kind, opts.kind) : undefined)
    .orderBy(desc(collectionEvents.id))
    .limit(opts.limit ?? 200);
}

/** Copies sold and what they fetched in all, since a date (all time when none). */
export async function soldTotals(db: Db, since?: string): Promise<{ copies: number; usd: number }> {
  const [r] = await db
    .select({ copies: sql<number>`COALESCE(SUM(-${collectionEvents.quantity}), 0)`, usd: sql<number>`COALESCE(SUM(-${collectionEvents.quantity} * ${collectionEvents.priceUsd}), 0)` })
    .from(collectionEvents)
    .where(and(eq(collectionEvents.kind, "sold"), since ? gte(collectionEvents.at, since) : undefined));
  return { copies: Number(r?.copies ?? 0), usd: Math.round(Number(r?.usd ?? 0) * 100) / 100 };
}
