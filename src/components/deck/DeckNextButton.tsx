"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { showDeckToast } from "./DeckRowActions";

/**
 * The Overview's next-step button when the step is a save: set the deck to Building, or build it from
 * your cards (the same rebuild the Deck settings panel runs, with the deck's saved settings). It says
 * it saved in the toast, since the next step (and so this button) changes once the page refreshes.
 */
export function DeckNextButton({
  deckId,
  run,
  label,
  quiet = false,
  rebuild,
}: {
  deckId: number;
  run: "build" | "rebuild";
  label: string;
  quiet?: boolean;
  rebuild?: { suggestUnowned: boolean; maxPrice?: number };
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function go() {
    setBusy(true);
    const json = { "Content-Type": "application/json" };
    const res =
      run === "build"
        ? await fetch(`/api/decks/${deckId}`, { method: "PATCH", headers: json, body: JSON.stringify({ status: "building" }) }).catch(() => undefined)
        : await fetch(`/api/decks/${deckId}/rebuild`, { method: "POST", headers: json, body: JSON.stringify(rebuild ?? {}) }).catch(() => undefined);
    setBusy(false);
    if (!res?.ok) return showDeckToast({ message: "That didn't work. Try again.", error: true });
    const body = run === "rebuild" ? await res.json().catch(() => ({})) : {};
    showDeckToast({
      message: body.warnings?.length ? `Built from your cards. ${body.warnings.join(" ")}` : run === "build" ? "Saved: Building. Your free copies are placed in it." : "Built from your cards.",
    });
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={go}
      disabled={busy}
      className={`inline-flex min-h-11 shrink-0 items-center justify-center whitespace-nowrap rounded-xl px-4 text-sm font-semibold disabled:opacity-60 ${quiet ? "border border-line hover:bg-background" : "bg-accent text-accent-fg"}`}
    >
      {busy ? (run === "build" ? "Saving…" : "Building…") : label}
    </button>
  );
}
