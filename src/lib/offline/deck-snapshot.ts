"use client";

import type { LoadedDeck } from "@/app/decks/[id]/data";
import type { AnalysisInputs } from "@/lib/deck/analysis";
import type { PriceView } from "@/lib/money";
import { readKept, refreshKept, type Kept } from "./kept";

/**
 * This device's copy of a deck (GET /api/decks/:id/snapshot): the deck as its pages see it, its
 * combos and the price setting. Fetched when a deck page shows a version the device doesn't have,
 * and by the service worker when it saves the deck's pages for offline. With it, the deck's tabs can
 * be drawn on the device while edits wait to be sent (src/components/offline/DeviceDeck.tsx).
 */

export type DeckSnapshot = { version: string; v: LoadedDeck; inputs: AnalysisInputs; pv: PriceView };

export const snapshotPath = (deckId: number) => `/api/decks/${deckId}/snapshot`;

export function readSnapshot(deckId: number): Promise<Kept<DeckSnapshot> | null> {
  return readKept<DeckSnapshot>(snapshotPath(deckId));
}

/** Fetch the deck afresh and keep it. Null offline or when the server doesn't answer. */
export async function fetchSnapshot(deckId: number): Promise<Kept<DeckSnapshot> | null> {
  return (await refreshKept(snapshotPath(deckId))) === "failed" ? null : readSnapshot(deckId);
}
