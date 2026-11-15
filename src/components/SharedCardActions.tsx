"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

type Deck = { deckId: number; deckName: string; recommended: boolean; holds: boolean };

const and = (names: string[]) => (names.length <= 1 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`);

/**
 * Giving a shared card to one deck (POST /api/decks/shared), with a line that says what happened.
 * The page refreshes in place afterwards; the message stays while the component stays mounted.
 */
export function useGiveShared(oracleId: string, decks: Deck[], cardName?: string) {
  const router = useRouter();
  const [busy, setBusy] = useState<number>();
  const [error, setError] = useState<string>();
  const [saved, setSaved] = useState<string>();
  const [refreshing, startTransition] = useTransition();

  async function give(deck: Deck) {
    setBusy(deck.deckId);
    setError(undefined);
    setSaved(undefined);
    const res = await fetch("/api/decks/shared", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ oracleId, deckId: deck.deckId }) }).catch(
      () => undefined,
    );
    setBusy(undefined);
    if (!res?.ok) return setError("Couldn’t move it. Nothing changed. Try again.");
    const body = (await res.json().catch(() => ({}))) as { rebuilt?: number[] };
    const rebuilt = decks.filter((d) => d.deckId !== deck.deckId && body.rebuilt?.includes(d.deckId)).map((d) => d.deckName);
    setSaved(
      `Saved. ${cardName ?? "It"} is in ${deck.deckName} now.` +
        (rebuilt.length ? ` ${and(rebuilt)} ${rebuilt.length === 1 ? "was" : "were"} rebuilt to fill the gap.` : ""),
    );
    startTransition(() => router.refresh());
  }

  return { give, busy, error, saved, disabled: busy !== undefined || refreshing };
}

/** The saved and error lines under a set of give buttons. */
export function GiveStatus({ saved, error }: { saved?: string; error?: string }) {
  return (
    <>
      <p role="status" className="text-sm text-ok empty:hidden">
        {saved}
      </p>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </>
  );
}

/**
 * "Give to <deck>" buttons for one shared card (the card page). The recommended deck's button is
 * that page's main button. The Shared cards list uses SharedCardChoice, with a button in each deck's box.
 */
export function SharedCardActions({
  oracleId,
  decks,
  cardName,
}: {
  oracleId: string;
  decks: Deck[];
  /** For the saved message: "Sol Ring is in Toph now." */
  cardName?: string;
}) {
  const { give, busy, error, saved, disabled } = useGiveShared(oracleId, decks, cardName);
  const style = (d: Deck) => (d.recommended ? "bg-accent font-medium text-accent-fg hover:opacity-90" : "border border-line hover:bg-background");
  const open = decks.filter((d) => !d.holds);
  return (
    <div className="space-y-2">
      {open.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {open.map((d) => (
            <button
              key={d.deckId}
              type="button"
              disabled={disabled}
              onClick={() => give(d)}
              className={`inline-flex min-h-11 max-w-full items-center rounded-lg px-3.5 text-left text-sm disabled:cursor-not-allowed disabled:opacity-50 ${style(d)}`}
            >
              <span className="truncate">{busy === d.deckId ? "Moving…" : `Give to ${d.deckName}`}</span>
            </button>
          ))}
        </div>
      )}
      <GiveStatus saved={saved} error={error} />
    </div>
  );
}
