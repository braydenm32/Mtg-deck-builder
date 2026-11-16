"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Place } from "@/lib/collection/locations";
import { showDeckToast } from "./deck/DeckRowActions";
import { MoveSheet } from "./MoveSheet";

/**
 * Today's "put them all in one place" for the cards that need a home (POST /api/collection/needs-home).
 * Once they're moved the row goes away, so the result shows in the page's toast (DeckToast).
 */
export function GiveAllAHome({ copies, places }: { copies: number; places: Place[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  async function pick(location: string) {
    const res = await fetch("/api/collection/needs-home", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ location }),
    }).catch(() => undefined);
    setOpen(false);
    if (!res?.ok) return showDeckToast({ message: "Couldn't move them. Try again.", error: true });
    const { moved } = (await res.json()) as { moved: number };
    showDeckToast({ message: `Moved ${moved === 1 ? "1 card" : `${moved.toLocaleString()} cards`} to ${location}.` });
    router.refresh();
  }

  return (
    <div className="pt-1">
      <button type="button" className="inline-flex min-h-11 items-center rounded-xl border border-line px-4 text-sm font-medium hover:bg-(--panel-2)" onClick={() => setOpen(true)}>
        {copies === 1 ? "Give it a home" : `Put all ${copies.toLocaleString()} in one place`}
      </button>
      {open && (
        <MoveSheet
          title={copies === 1 ? "Give it a home" : `Put all ${copies.toLocaleString()} in one place`}
          sub="Each card can still move on its own from its card page."
          places={places}
          onPick={(to) => pick(to)}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}
