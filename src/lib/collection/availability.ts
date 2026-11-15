import { and, eq, inArray, isNull, ne, or } from "drizzle-orm";
import type { Db } from "@/db/client";
import { cards, deckCards, decks } from "@/db/schema";
import { isBasicLand } from "@/lib/deck/build";
import { ownership, placements, type DeckStatus } from "@/lib/deck/store";

export type CardAvailability = {
  /** R1 for this card: every copy, proxies included. */
  owned: number;
  /** How many of the owned copies are proxies. */
  proxies: number;
  /** R4: copies claimed by building and built decks (`placements` in src/lib/deck/store.ts). */
  inDecks: number;
  /** R4: owned − in decks, never below 0. */
  free: number;
  /** The building and built decks holding a copy. */
  decks: { id: number; name: string }[];
  /**
   * R5: active decks (idea, building or built) with an open slot for this card, on the main deck or
   * the "wanted" board. A deck that already holds a copy isn't listed again. Never set for basic
   * lands, which every deck assumes you have.
   */
  wantedBy: { id: number; name: string; status: DeckStatus; synergy: number | null }[];
  /** Active decks this card leads as commander or partner. The deck code doesn't count these as "in decks". */
  commanderOf: { id: number; name: string; status: DeckStatus }[];
  /** Copies per location, most first. An empty location means the copies need a home. */
  places: { location: string; copies: number }[];
};

/**
 * Owned · in decks · free · where, and which decks want each card (R4 and R5 in
 * docs/design/3-numbers-audit.md). Read-only. Cards you don't own are left out of the map.
 */
export async function cardAvailability(db: Db, oracleIds: string[]): Promise<Map<string, CardAvailability>> {
  const ids = [...new Set(oracleIds)];
  const out = new Map<string, CardAvailability>();
  if (!ids.length) return out;

  const [own, held, open, led, names] = await Promise.all([
    ownership(db, ids),
    placements(db),
    db
      .select({ oracleId: deckCards.oracleId, id: decks.id, name: decks.name, status: decks.status, synergy: deckCards.synergy })
      .from(deckCards)
      .innerJoin(decks, eq(decks.id, deckCards.deckId))
      .where(
        and(
          inArray(deckCards.oracleId, ids),
          inArray(deckCards.board, ["main", "wanted"]),
          isNull(deckCards.collectionItemId),
          ne(decks.status, "retired"),
        ),
      )
      .orderBy(decks.name),
    db
      .select({ id: decks.id, name: decks.name, status: decks.status, commander: decks.commanderOracleId, partner: decks.partnerOracleId })
      .from(decks)
      .where(and(ne(decks.status, "retired"), or(inArray(decks.commanderOracleId, ids), inArray(decks.partnerOracleId, ids)))),
    db.select({ oracleId: cards.oracleId, name: cards.name }).from(cards).where(inArray(cards.oracleId, ids)),
  ]);
  const basic = new Set(names.filter((n) => isBasicLand(n.name)).map((n) => n.oracleId));

  for (const id of ids) {
    const o = own.get(id);
    if (!o || o.owned <= 0) continue;
    const h = held.byCard.get(id);
    const inDecks = h?.copies ?? 0;
    const holding = new Set((h?.decks ?? []).map((d) => d.id));

    const wantedBy: CardAvailability["wantedBy"] = [];
    if (!basic.has(id)) {
      for (const w of open) {
        if (w.oracleId !== id || holding.has(w.id) || wantedBy.some((x) => x.id === w.id)) continue;
        wantedBy.push({ id: w.id, name: w.name, status: w.status, synergy: w.synergy });
      }
    }

    const byPlace = new Map<string, number>();
    for (const s of o.stacks) byPlace.set(s.location, (byPlace.get(s.location) ?? 0) + s.quantity);
    const places = [...byPlace]
      .map(([location, copies]) => ({ location, copies }))
      .sort((a, b) => b.copies - a.copies || a.location.localeCompare(b.location));

    out.set(id, {
      owned: o.owned,
      proxies: o.owned - o.real,
      inDecks,
      free: Math.max(0, o.owned - inDecks),
      decks: h?.decks ?? [],
      wantedBy,
      commanderOf: led.filter((d) => d.commander === id || d.partner === id).map((d) => ({ id: d.id, name: d.name, status: d.status })),
      places,
    });
  }
  return out;
}
