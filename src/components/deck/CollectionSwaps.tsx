"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Swap } from "@/lib/deck/swaps";
import { ROLE_LABELS, type Role } from "@/lib/deck/roles";
import { showDeckToast } from "./DeckRowActions";

const post = (deckId: number, body: unknown) =>
  fetch(`/api/decks/${deckId}/swaps`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => undefined);

/**
 * Upgrade the deck from your own collection: free copies you own that beat its weakest cards, job
 * for job. Made for a precon or a list you imported, where the builder didn't pick the cards, but
 * works for any deck. Looked up when asked (it reads your whole collection, like a rebuild).
 */
export function CollectionSwaps({ deckId }: { deckId: number }) {
  const router = useRouter();
  const [swaps, setSwaps] = useState<Swap[]>();
  const [state, setState] = useState<"idle" | "looking" | "failed">("idle");
  const [busy, setBusy] = useState<number>();

  async function find() {
    setState("looking");
    const res = await fetch(`/api/decks/${deckId}/swaps`).catch(() => undefined);
    if (!res?.ok) return setState("failed");
    setSwaps(((await res.json()) as { swaps: Swap[] }).swaps);
    setState("idle");
  }

  async function swap(s: Swap) {
    setBusy(s.out.id);
    const res = await post(deckId, { outId: s.out.id, inOracleId: s.in.oracleId });
    setBusy(undefined);
    if (!res?.ok) return showDeckToast({ message: "That didn’t save. Try again.", error: true });
    const { removed } = (await res.json()) as { removed: unknown };
    setSwaps((cur) => cur?.filter((x) => x.out.id !== s.out.id && x.in.oracleId !== s.in.oracleId));
    showDeckToast({
      message: `Swapped ${s.out.name} for ${s.in.name}`,
      undo: async () => (await post(deckId, { undo: { removed, inOracleId: s.in.oracleId } })) ?? false,
    });
    router.refresh();
  }

  return (
    <section className="space-y-3 rounded-2xl border border-line bg-panel p-4" aria-labelledby="swaps-h">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <h2 id="swaps-h" className="text-lg font-semibold">
          Swaps from your collection
        </h2>
        {swaps && <span className="text-sm text-muted tabular-nums">{swaps.length}</span>}
      </div>
      {!swaps && (
        <>
          <p className="text-sm text-muted">Cards you own and aren’t using that beat this deck’s weakest, job for job. Good for upgrading a precon.</p>
          {state === "failed" && <p className="text-sm text-danger">Couldn’t look just now. Check the connection and try again.</p>}
          <button
            type="button"
            className="inline-flex min-h-11 items-center rounded-xl border border-line px-4 text-sm font-medium hover:bg-background disabled:opacity-50"
            onClick={() => void find()}
            disabled={state === "looking"}
          >
            {state === "looking" ? "Looking through your collection…" : "Find swaps"}
          </button>
        </>
      )}
      {swaps && swaps.length === 0 && <p className="text-sm text-muted">No clear swaps: none of your free cards beat what’s in the deck.</p>}
      {swaps && swaps.length > 0 && (
        <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line">
          {swaps.map((s) => (
            <li key={s.out.id} className="flex min-h-14 items-center gap-3 py-2 pr-1 pl-3">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-medium">{s.in.name}</span>
                <span className="block truncate text-xs text-muted">
                  for {s.out.name}
                  {s.role !== "other" ? ` · ${ROLE_LABELS[s.role as Role] ?? s.role}` : ""}
                  {s.in.reason ? ` · ${s.in.reason}` : ""}
                </span>
              </span>
              <button
                type="button"
                className="inline-flex min-h-11 shrink-0 items-center rounded-xl px-3 text-sm font-semibold text-accent hover:bg-background disabled:opacity-50"
                disabled={busy !== undefined}
                onClick={() => void swap(s)}
              >
                {busy === s.out.id ? "Swapping…" : "Swap"}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
