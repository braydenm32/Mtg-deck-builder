/**
 * Card data downloads started from inside the app (first run, the Settings button, and the weekly
 * refresh), so a hosted copy never needs `npm run sync:cards` on a command line.
 *
 * One download at a time: a lock row in `meta` stops two servers (or two taps) from syncing at
 * once. A lock older than LOCK_STALE_MS belongs to a download that died, and is taken over.
 */
import { eq, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { meta } from "@/db/schema";
import { lastSync, syncCards } from "./sync";

const LOCK = "sync:running";
const ERROR = "sync:error";
/** A download takes 20 s on a laptop and a minute or two against a hosted database. */
const LOCK_STALE_MS = 6 * 60 * 1000;
/** Refresh card data (new sets, prices) when it's older than this. */
export const REFRESH_AFTER_DAYS = 7;

export type CardDataState = {
  /** When Scryfall last published the data we hold; undefined before the first download. */
  lastSync?: string;
  /** A download is under way (since this time). */
  runningSince?: string;
  /** The last download failed with this message. */
  error?: string;
};

async function metaValue(db: Db, key: string): Promise<string | undefined> {
  const [row] = await db.select().from(meta).where(eq(meta.key, key));
  return row?.value;
}

export async function cardDataState(db: Db): Promise<CardDataState> {
  const [last, running, error] = await Promise.all([lastSync(db), metaValue(db, LOCK), metaValue(db, ERROR)]);
  const live = running && Date.now() - Date.parse(running) < LOCK_STALE_MS ? running : undefined;
  return { lastSync: last, runningSince: live, error };
}

/** Is the card data missing or older than REFRESH_AFTER_DAYS? */
export function needsRefresh(state: CardDataState, now = Date.now()): boolean {
  if (state.runningSince) return false;
  if (!state.lastSync) return true;
  return now - Date.parse(state.lastSync) > REFRESH_AFTER_DAYS * 86_400_000;
}

/** Take the download lock. False when another download holds it. */
async function lock(db: Db): Promise<boolean> {
  const now = new Date().toISOString();
  const stale = new Date(Date.now() - LOCK_STALE_MS).toISOString();
  const r = await db.run(sql`
    INSERT INTO meta (key, value) VALUES (${LOCK}, ${now})
    ON CONFLICT (key) DO UPDATE SET value = excluded.value WHERE meta.value < ${stale}`);
  return r.rowsAffected > 0;
}

async function unlock(db: Db) {
  await db.delete(meta).where(eq(meta.key, LOCK));
}

export type RefreshResult = { started: false; reason: "running" } | { started: true; ok: true } | { started: true; ok: false; error: string };

/**
 * Download Scryfall's card data now, unless a download is already running. Skips files that are
 * already current (Scryfall publishes once a day), so it's cheap to call.
 */
export async function refreshCardData(db: Db, opts: { force?: boolean } = {}): Promise<RefreshResult> {
  if (!(await lock(db))) return { started: false, reason: "running" };
  try {
    await syncCards(db, { maxAgeHours: opts.force ? undefined : 20, progress: (m) => console.log(`[cards] ${m}`) });
    await db.delete(meta).where(eq(meta.key, ERROR));
    return { started: true, ok: true };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    console.error("[cards] download failed:", e);
    await db
      .insert(meta)
      .values({ key: ERROR, value: error })
      .onConflictDoUpdate({ target: meta.key, set: { value: error } })
      .catch(() => {});
    return { started: true, ok: false, error };
  } finally {
    await unlock(db).catch(() => {});
  }
}
