"use client";

import { useEffect, useRef, useState } from "react";

const MAX = 5000;

/**
 * Notes on a deck: what to swap, how it plays, what the playgroup thought. Saves by itself a moment
 * after you stop typing (and when you leave the box or the page), so there's no Save button to miss.
 */
export function DeckNotes({ deckId, initial }: { deckId: number; initial: string }) {
  const [text, setText] = useState(initial);
  const [state, setState] = useState<"saved" | "typing" | "saving" | "failed">("saved");
  const sent = useRef(initial);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const latest = useRef(initial);
  latest.current = text;

  async function save(keepalive = false) {
    clearTimeout(timer.current);
    const notes = latest.current;
    if (notes === sent.current) {
      setState("saved");
      return;
    }
    setState("saving");
    const res = await fetch(`/api/decks/${deckId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notes }),
      keepalive,
    }).catch(() => undefined);
    if (res?.ok) sent.current = notes;
    setState(res?.ok ? (latest.current === notes ? "saved" : "typing") : "failed");
  }

  // Leaving the page saves what's there.
  useEffect(() => {
    const flush = () => {
      if (latest.current !== sent.current) void save(true);
    };
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      flush();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deckId]);

  const status = { saved: text ? "Saved" : "", typing: "", saving: "Saving…", failed: "Not saved: no connection. It saves when you type again." }[state];
  return (
    <section className="min-w-0 space-y-2 rounded-2xl border border-line bg-panel p-4" aria-labelledby="notes-h">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="notes-h" className="text-lg font-semibold">
          Notes
        </h2>
        <span className={`text-xs ${state === "failed" ? "text-danger" : "text-muted"}`} role="status">
          {status}
        </span>
      </div>
      <textarea
        className="block min-h-28 w-full resize-y rounded-xl border border-line bg-background p-3 text-base leading-relaxed placeholder:text-muted"
        value={text}
        maxLength={MAX}
        placeholder="Swaps to try, how it plays, what to watch for…"
        aria-labelledby="notes-h"
        onChange={(e) => {
          setText(e.target.value);
          setState("typing");
          clearTimeout(timer.current);
          timer.current = setTimeout(() => void save(), 900);
        }}
        onBlur={() => void save()}
      />
    </section>
  );
}
