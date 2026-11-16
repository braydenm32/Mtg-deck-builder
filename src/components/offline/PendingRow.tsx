"use client";

import { rowOverlay } from "@/lib/offline/deck-edits";
import { useDeckEdits } from "@/lib/offline/outbox";

/**
 * A deck row that hides itself while an edit the page doesn't show yet has removed it, moved it to
 * the other board, or (for a suggestion) added it to the deck. Those edits are listed by
 * DeckPendingEdits until they're sent and the page is redrawn.
 */
export function PendingRow({ deckId, row, children }: { deckId: number; row: { id: number; oracleId: string; board: string }; children: React.ReactNode }) {
  const edits = useDeckEdits(deckId);
  return rowOverlay(edits, row).hidden ? null : children;
}
