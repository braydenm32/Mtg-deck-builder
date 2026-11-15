"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/** "Give to <deck>" buttons for one shared card. */
export function SharedCardActions({ oracleId, decks }: { oracleId: string; decks: { deckId: number; deckName: string; recommended: boolean; holds: boolean }[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<number>();
  const [error, setError] = useState<string>();
  async function give(deckId: number) {
    setBusy(deckId);
    setError(undefined);
    const res = await fetch("/api/decks/shared", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ oracleId, deckId }) });
    setBusy(undefined);
    if (!res.ok) return setError("Couldn't move it. Try again.");
    router.refresh();
  }
  return (
    <div className="flex flex-wrap gap-2">
      {decks.filter((d) => !d.holds).map((d) => (
        <button
          key={d.deckId}
          disabled={busy !== undefined}
          onClick={() => give(d.deckId)}
          className={`inline-flex min-h-11 items-center rounded-md px-3 text-sm disabled:opacity-50 ${d.recommended ? "bg-accent font-medium text-accent-fg" : "border border-line"}`}
        >
          {busy === d.deckId ? "Moving…" : `Give to ${d.deckName}`}
        </button>
      ))}
      {error && <p className="w-full text-sm text-danger">{error}</p>}
    </div>
  );
}
