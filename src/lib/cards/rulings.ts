import { eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { meta, printings } from "@/db/schema";
import { scryfallFetch } from "@/lib/scryfall/client";

export type Ruling = { date: string; text: string; source: string };
export type CardRulings = { rulings: Ruling[]; ok: boolean };

const TTL_MS = 30 * 24 * 60 * 60 * 1000;
const key = (oracleId: string) => `rulings:${oracleId}`;

type Fetch = (path: string) => Promise<{ data: { published_at: string; comment: string; source: string }[] }>;

/**
 * A card's official rulings and notes (Wizards' Gatherer rulings and Scryfall's), newest first.
 * Kept for a month, since rulings rarely change; an older copy is used when Scryfall can't be
 * reached. `ok` is false only when there's nothing kept and Scryfall can't be reached.
 */
export async function cardRulings(db: Db, oracleId: string, fetchImpl: Fetch = (p) => scryfallFetch(p)): Promise<CardRulings> {
  const [kept] = await db.select().from(meta).where(eq(meta.key, key(oracleId)));
  const old = kept ? (JSON.parse(kept.value) as { at: string; rulings: Ruling[] }) : undefined;
  if (old && Date.now() - Date.parse(old.at) < TTL_MS) return { rulings: old.rulings, ok: true };
  const [p] = await db.select({ id: printings.id }).from(printings).where(eq(printings.oracleId, oracleId)).limit(1);
  if (!p) return { rulings: old?.rulings ?? [], ok: !!old };
  try {
    const res = await fetchImpl(`/cards/${p.id}/rulings`);
    const rulings = res.data
      .map((r) => ({ date: r.published_at, text: r.comment, source: r.source === "wotc" ? "Wizards" : "Scryfall" }))
      .sort((a, b) => b.date.localeCompare(a.date));
    const value = JSON.stringify({ at: new Date().toISOString(), rulings });
    await db.insert(meta).values({ key: key(oracleId), value }).onConflictDoUpdate({ target: meta.key, set: { value } });
    return { rulings, ok: true };
  } catch {
    return { rulings: old?.rulings ?? [], ok: !!old };
  }
}
