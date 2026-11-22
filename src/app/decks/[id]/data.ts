import { cache } from "react";
import { notFound } from "next/navigation";
import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db/client";
import { cards, collectionItems } from "@/db/schema";
import { normName } from "@/lib/cards/normalize";
import { finishAnalysis, type AnalysisInputs } from "@/lib/deck/analysis";
import { deckEntries } from "@/lib/deck/entries";
import { getDeck } from "@/lib/deck/store";
import { deckCombos } from "@/lib/spellbook/client";

/** One getDeck per request, shared by the layout and the tab. */
export const loadDeck = cache(async (idParam: string) => {
  const id = Number.parseInt(idParam, 10);
  const v = Number.isFinite(id) ? await getDeck(await getDb(), id) : undefined;
  if (!v) notFound();
  return v;
});

export type LoadedDeck = Awaited<ReturnType<typeof loadDeck>>;
export type DeckRow = LoadedDeck["cards"][number];

/** The deck as DeckEntry[] for the analysis modules (kept in src/lib/deck/entries.ts, which the device uses too). */
export { deckEntries };

/**
 * What the overview's analysis needs from outside the deck: its combos from Commander Spellbook
 * (cached a week; a changed deck shows its last answer while Spellbook is asked again in the
 * background), or the built-in list when it can't be reached, and which "one card away" combos you
 * could finish from your collection. The device keeps these with its copy of the deck.
 */
export async function analysisInputs(v: LoadedDeck): Promise<AnalysisInputs> {
  const db = await getDb();
  const found = await deckCombos(db, deckEntries(v), { deckId: v.deck.id });
  const missing = [...new Set(found.near.map((n) => n.missing))];
  // By normalised name first, which is indexed (cards.name isn't, so this read the whole collection).
  const ownedRows = missing.length
    ? await db
        .selectDistinct({ name: cards.name })
        .from(cards)
        .innerJoin(collectionItems, eq(collectionItems.oracleId, cards.oracleId))
        .where(and(inArray(cards.normName, [...new Set(missing.map(normName))]), inArray(cards.name, missing)))
    : [];
  const owned = new Set(ownedRows.map((r) => r.name));
  return { combos: found.combos, near: found.near.map((n) => ({ ...n, owned: owned.has(n.missing) })), source: found.source, ...(found.pool ? { pool: found.pool } : {}) };
}

/** Legality, stats, bracket and combos for the overview. */
export async function analyze(v: LoadedDeck) {
  return finishAnalysis(v, await analysisInputs(v));
}
