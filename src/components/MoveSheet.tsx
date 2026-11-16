"use client";

import { useState } from "react";
import { Sheet } from "@/components/deck/Sheet";
import type { Place } from "@/lib/collection/locations";

/**
 * Pick where cards go: the boxes and binders you already have, most cards first, or a new one.
 * With `max` above 1 it also asks how many (all by default). The sheet doesn't save anything itself:
 * `onPick` does, and the sheet shows "Moving…" until it finishes.
 */
export function MoveSheet({
  title,
  sub,
  places,
  current = "",
  max = 1,
  verb = "Move",
  busyVerb = "Moving…",
  placeholder,
  listLabel = "Your boxes and binders",
  onPick,
  onClose,
}: {
  title: string;
  sub?: React.ReactNode;
  places: Place[];
  /** The place the cards are in now, left out of the list. */
  current?: string;
  /** How many copies can move. Above 1, a stepper asks how many. */
  max?: number;
  /** The new-name button's word, and what it says while saving ("Rename", "Renaming…"). */
  verb?: string;
  busyVerb?: string;
  /** The new-name field's placeholder. */
  placeholder?: string;
  listLabel?: string;
  onPick: (location: string, count: number) => Promise<void>;
  onClose: () => void;
}) {
  const [count, setCount] = useState(max);
  const [fresh, setFresh] = useState("");
  const [busy, setBusy] = useState(false);
  const options = places.filter((p) => p.location !== current);

  async function pick(location: string) {
    const to = location.trim();
    if (!to || busy) return;
    setBusy(true);
    await onPick(to, count);
    setBusy(false);
  }

  return (
    <Sheet title={title} sub={sub} onClose={onClose}>
      <div className="space-y-3 px-3 pb-1">
        {max > 1 && (
          <div className="flex min-h-12 items-center justify-between gap-3">
            <span id="move-count" className="text-[15px]">
              How many
            </span>
            <span className="flex items-center gap-1" role="group" aria-labelledby="move-count">
              <button type="button" aria-label="Move one fewer" className="h-11 w-11 rounded-xl border border-line text-lg disabled:opacity-40" disabled={busy || count <= 1} onClick={() => setCount((n) => n - 1)}>
                −
              </button>
              <span className="w-14 text-center font-semibold tabular-nums" aria-live="polite">
                {count === max ? `All ${max}` : count}
              </span>
              <button type="button" aria-label="Move one more" className="h-11 w-11 rounded-xl border border-line text-lg disabled:opacity-40" disabled={busy || count >= max} onClick={() => setCount((n) => n + 1)}>
                +
              </button>
            </span>
          </div>
        )}

        {options.length > 0 && (
          <ul className="-mx-3 max-h-[40dvh] overflow-y-auto" aria-label={listLabel}>
            {options.map((p) => (
              <li key={p.location}>
                <button type="button" className="sheet-link justify-between gap-3 disabled:opacity-50" disabled={busy} onClick={() => pick(p.location)}>
                  <span className="min-w-0 truncate text-left">{p.location}</span>
                  <span className="shrink-0 text-[13px] text-muted tabular-nums">{p.copies.toLocaleString()}</span>
                </button>
              </li>
            ))}
          </ul>
        )}

        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            pick(fresh);
          }}
        >
          <label className="sr-only" htmlFor="move-new">
            A new box or binder
          </label>
          <input
            id="move-new"
            value={fresh}
            onChange={(e) => setFresh(e.target.value)}
            maxLength={120}
            placeholder={placeholder ?? (options.length ? "Or a new box or binder" : "Name a box or binder")}
            className="min-h-12 min-w-0 flex-1 rounded-xl border border-line bg-background px-3 text-[16px] placeholder:text-muted"
            enterKeyHint="done"
          />
          <button type="submit" disabled={busy || !fresh.trim()} className="min-h-12 shrink-0 rounded-xl border border-line px-4 font-medium disabled:opacity-40">
            {busy ? busyVerb : verb}
          </button>
        </form>
      </div>
    </Sheet>
  );
}
