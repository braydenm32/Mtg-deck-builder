"use client";

import type { CardDetail } from "./deck-model";
import { readKept, refreshKept } from "./kept";

/**
 * What the deck modules need about every card you can put in a deck (mana value, type, rules text…),
 * kept on this device in 16 parts by oracle id (about 3 MB to download, refreshed at most once a day
 * and only when the cards changed), so a card added to a deck offline counts in its numbers. A part
 * is only read when a card in it is needed. See docs/speed.md, stage 3.
 */

const SHARDS = "0123456789abcdef";
const DAY_MS = 24 * 60 * 60 * 1000;
const path = (shard: string) => `/api/cards/details/${shard}`;

type Shard = { fields: (keyof CardDetail)[]; rows: unknown[][] };
const parsed = new Map<string, Promise<Map<string, CardDetail> | null>>();

let refreshing: Promise<void> | undefined;

/** Fetch the parts this device doesn't have, or has had for a day and that changed. Quietly stops offline. */
export function refreshCardDetails(): Promise<void> {
  refreshing ??= (async () => {
    const conn = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
    if (conn?.saveData) return;
    for (const s of SHARDS) {
      const r = await refreshKept(path(s), { maxAgeMs: DAY_MS });
      if (r === "failed") return;
      if (r === "changed") parsed.delete(s);
    }
  })().finally(() => {
    refreshing = undefined;
  });
  return refreshing;
}

function shard(s: string): Promise<Map<string, CardDetail> | null> {
  let p = parsed.get(s);
  if (!p) {
    p = readKept<Shard>(path(s)).then((kept) => {
      if (!kept) {
        parsed.delete(s);
        return null;
      }
      const m = new Map<string, CardDetail>();
      for (const row of kept.data.rows) {
        const card = Object.fromEntries(kept.data.fields.map((f, i) => [f, row[i]])) as CardDetail;
        m.set(card.oracleId, card);
      }
      return m;
    });
    parsed.set(s, p);
  }
  return p;
}

/** The kept details of these cards (those this device has). */
export async function cardDetails(oracleIds: readonly string[]): Promise<Map<string, CardDetail>> {
  const out = new Map<string, CardDetail>();
  for (const id of new Set(oracleIds)) {
    const d = (await shard(id[0]?.toLowerCase() ?? ""))?.get(id);
    if (d) out.set(id, d);
  }
  return out;
}
