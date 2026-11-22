"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { showDeckToast } from "./DeckRowActions";

const restore = (deckId: number, versionId: number) =>
  fetch(`/api/decks/${deckId}/history`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ versionId }) }).catch(() => undefined);

/** "Restore": put this version back. The deck as it was is kept first, so Undo restores that. */
export function RestoreVersion({ deckId, versionId, label }: { deckId: number; versionId: number; label: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    const res = await restore(deckId, versionId);
    setBusy(false);
    if (!res?.ok) return showDeckToast({ message: "That didn’t restore. Try again.", error: true });
    const { before } = (await res.json()) as { before: number };
    showDeckToast({
      message: `Restored the deck from ${label}`,
      undo: async () => {
        const r = await restore(deckId, before);
        router.refresh();
        return r ?? false;
      },
    });
    router.refresh();
  }

  return (
    <button type="button" onClick={() => void run()} disabled={busy} className="inline-flex min-h-11 shrink-0 items-center rounded-xl px-3 text-sm font-semibold text-accent hover:bg-background disabled:opacity-50">
      {busy ? "Restoring…" : "Restore"}
    </button>
  );
}
