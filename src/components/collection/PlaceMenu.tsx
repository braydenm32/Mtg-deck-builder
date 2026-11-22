"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { MoveSheet } from "@/components/MoveSheet";
import { showDeckToast } from "@/components/deck/DeckRowActions";
import type { Place } from "@/lib/collection/locations";

const undoBulk = () => fetch("/api/collection/bulk/undo", { method: "POST" });

/**
 * A box or binder's ⋯: rename it, or merge it into another by picking that one. Merged copies join
 * identical stacks there, decks keep their copies, and the toast's Undo puts everything back.
 * The page renders one <DeckToast /> for the messages.
 */
export function PlaceMenu({ name, places }: { name: string; places: Place[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  async function rename(to: string) {
    const res = await fetch("/api/collection/places", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ from: name, to }) }).catch(() => undefined);
    if (!res?.ok) {
      showDeckToast({ message: "That didn’t save. Try again.", error: true });
      return;
    }
    const r = (await res.json()) as { copies: number };
    setOpen(false);
    const merged = places.some((p) => p.location === to);
    const cards = `${r.copies.toLocaleString("en-AU")} ${r.copies === 1 ? "card" : "cards"}`;
    showDeckToast({ message: merged ? `Merged ${name} into ${to} (${cards})` : `Renamed ${name} to ${to}`, undo: undoBulk });
    router.refresh();
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Rename or merge ${name}`}
        className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-lg text-muted hover:bg-(--panel-2) hover:text-foreground"
      >
        ⋯
      </button>
      {open && (
        <MoveSheet
          title={`Rename ${name}`}
          sub="Type a new name, or pick a box or binder to merge it into."
          places={places}
          current={name}
          verb="Rename"
          busyVerb="Renaming…"
          placeholder="New name"
          listLabel="Merge into"
          onPick={async (to) => rename(to)}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
