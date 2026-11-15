import { and, eq, inArray } from "drizzle-orm";
import type { Db } from "@/db/client";
import { cards, deckCards, decks } from "@/db/schema";
import { isBasicLand } from "./build";
import { CLAIMING, ownership, placeCopies, rebuildDeck } from "./store";

/** Below this price (USD, cheapest printing) we suggest getting another copy instead of choosing. */
export const CHEAP_COPY_USD = 2;

export type SharedCard = {
  oracleId: string;
  name: string;
  imageSmall: string | null;
  priceUsd: number | null;
  /** Real (non-proxy) copies you own. */
  copies: number;
  decks: {
    deckId: number;
    deckName: string;
    deckStatus: string;
    /** This deck has one of your copies right now. */
    holds: boolean;
    synergy: number | null;
    score: number | null;
    recommended: boolean;
  }[];
  /** Why the recommended deck(s) should get it. */
  reason: string;
  /** Cheap enough that a second copy is the easy answer. */
  getAnother: boolean;
  /** The recommended deck(s) already hold the copies: nothing to move unless you disagree. */
  settled: boolean;
};

const pct = (n: number | null) => (n === null ? "no EDHREC data" : `${n >= 0 ? "+" : ""}${Math.round(n * 100)}% synergy`);

/**
 * Cards that more active decks want than you have copies of. For each, recommend the deck(s) where
 * the card matters most: highest EDHREC synergy with that commander, then the builder's score.
 */
export async function sharedCards(db: Db): Promise<SharedCard[]> {
  const rows = await db
    .select({
      oracleId: deckCards.oracleId,
      deckId: decks.id,
      deckName: decks.name,
      deckStatus: decks.status,
      board: deckCards.board,
      itemId: deckCards.collectionItemId,
      synergy: deckCards.synergy,
      score: deckCards.score,
      name: cards.name,
      imageSmall: cards.imageSmall,
      priceUsd: cards.priceUsd,
    })
    .from(deckCards)
    .innerJoin(decks, eq(decks.id, deckCards.deckId))
    .innerJoin(cards, eq(cards.oracleId, deckCards.oracleId))
    .where(and(inArray(decks.status, CLAIMING), inArray(deckCards.board, ["main", "wanted"])));
  const byCard = new Map<string, typeof rows>();
  for (const r of rows) {
    if (isBasicLand(r.name)) continue;
    const list = byCard.get(r.oracleId) ?? [];
    if (!list.some((x) => x.deckId === r.deckId)) list.push(r);
    byCard.set(r.oracleId, list);
  }
  const own = await ownership(db, [...byCard.keys()]);
  const out: SharedCard[] = [];
  for (const [oracleId, list] of byCard) {
    const copies = own.get(oracleId)?.real ?? 0;
    if (copies === 0 || list.length <= copies) continue;
    const ranked = [...list].sort((a, b) => (b.synergy ?? -2) - (a.synergy ?? -2) || (b.score ?? 0) - (a.score ?? 0));
    const best = ranked.slice(0, copies);
    const rest = ranked.slice(copies);
    const first = list[0];
    const reason =
      best.length === 1
        ? `${best[0].deckName}: ${pct(best[0].synergy)}, vs ${rest.map((r) => `${r.deckName}: ${pct(r.synergy)}`).join(", ")}`
        : `Best fits: ${best.map((b) => `${b.deckName} (${pct(b.synergy)})`).join(", ")}`;
    out.push({
      oracleId,
      name: first.name,
      imageSmall: first.imageSmall,
      priceUsd: first.priceUsd,
      copies,
      decks: ranked.map((r) => ({
        deckId: r.deckId,
        deckName: r.deckName,
        deckStatus: r.deckStatus,
        holds: r.board === "main" && r.itemId !== null,
        synergy: r.synergy,
        score: r.score,
        recommended: best.includes(r),
      })),
      reason,
      getAnother: first.priceUsd !== null && first.priceUsd < CHEAP_COPY_USD,
      settled: best.every((b) => b.board === "main" && b.itemId !== null),
    });
  }
  // Biggest synergy gaps first: those are the decisions that matter most.
  const gap = (c: SharedCard) => (c.decks[0].synergy ?? 0) - (c.decks[c.decks.length - 1].synergy ?? 0);
  return out.sort((a, b) => Number(a.settled) - Number(b.settled) || gap(b) - gap(a) || a.name.localeCompare(b.name));
}

/**
 * Give a shared card to one deck: it's locked into that deck, the other decks that held a copy
 * mark it as wanted, and decks still being built are rebuilt to fill the gap.
 */
export async function moveCardToDeck(db: Db, oracleId: string, targetDeckId: number) {
  const copies = (await ownership(db, [oracleId])).get(oracleId)?.real ?? 0;
  const rows = await db
    .select({ dc: deckCards, status: decks.status })
    .from(deckCards)
    .innerJoin(decks, eq(decks.id, deckCards.deckId))
    .where(and(eq(deckCards.oracleId, oracleId), inArray(deckCards.board, ["main", "wanted"]), inArray(decks.status, CLAIMING)));
  const target = rows.find((r) => r.dc.deckId === targetDeckId);
  const touched = new Set<number>([targetDeckId]);

  await db.transaction(async (tx) => {
    if (target) {
      await tx.update(deckCards).set({ board: "main", locked: true, acquire: null }).where(eq(deckCards.id, target.dc.id));
    } else {
      await tx.insert(deckCards).values({ deckId: targetDeckId, oracleId, board: "main", locked: true, addedBy: "user", reason: "Moved here from shared cards" });
    }
    // Free up enough copies: release them from the other decks holding one, weakest fit first.
    const holders = rows
      .filter((r) => r.dc.deckId !== targetDeckId && r.dc.board === "main" && r.dc.collectionItemId !== null)
      .sort((a, b) => (a.dc.synergy ?? -2) - (b.dc.synergy ?? -2));
    let excess = holders.length + 1 - copies;
    for (const h of holders) {
      if (excess <= 0) break;
      await tx.update(deckCards).set({ board: "wanted", locked: false, collectionItemId: null }).where(eq(deckCards.id, h.dc.id));
      touched.add(h.dc.deckId);
      excess -= 1;
    }
    await tx.update(deckCards).set({ collectionItemId: null }).where(eq(deckCards.id, target?.dc.id ?? -1));
  });

  for (const id of touched) if (id !== targetDeckId) await placeCopies(db, id);
  await placeCopies(db, targetDeckId);
  const statuses = await db.select({ id: decks.id, status: decks.status }).from(decks).where(inArray(decks.id, [...touched]));
  // Rebuild decks still in progress so they refill (or trim) around the move. Built decks keep their list.
  for (const d of statuses) if (d.status === "building") await rebuildDeck(db, d.id);
  return { rebuilt: statuses.filter((d) => d.status === "building").map((d) => d.id) };
}

/** Count of shared cards, for the nav badge and deck list. */
export async function sharedCount(db: Db): Promise<number> {
  return (await sharedCards(db)).length;
}
