"use client";

import type { OwnedRow } from "@/lib/deck/store";
import type { OwnedIndex } from "./deck-model";
import { readKept, refreshKept } from "./kept";

/**
 * How many copies you own of each card and which decks hold them, kept on this device so a card added
 * to a deck offline shows whether you have a copy for it. Fetched again on a deck's page at most every
 * 10 minutes (a 304 when nothing changed).
 */

const PATH = "/api/collection/owned";
const MAX_AGE_MS = 10 * 60 * 1000;

let index: Promise<OwnedIndex | null> | undefined;

export async function refreshOwned(): Promise<void> {
  if ((await refreshKept(PATH, { maxAgeMs: MAX_AGE_MS })) === "changed") index = undefined;
}

/** What this device knows you own, or null when it has never fetched it. */
export function ownedIndex(): Promise<OwnedIndex | null> {
  index ??= readKept<{ decks: [number, string][]; cards: OwnedRow[] }>(PATH).then((kept) => {
    if (!kept) {
      index = undefined;
      return null;
    }
    return { decks: new Map(kept.data.decks), cards: new Map(kept.data.cards.map((c) => [c[0], c])) };
  });
  return index;
}
