"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type Row = { id: number; oracleId: string; name: string; locked: boolean; board: string; acquire: "buy" | "proxy" | null; state: string };

const REMOVED_EVENT = "deck-card-removed";

/** Lock, move to maybeboard, buy/proxy, remove. Small buttons with 44px targets. */
export function DeckCardControls({ deckId, row }: { deckId: number; row: Row }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);

  async function patch(body: Record<string, unknown>) {
    setBusy(true);
    await fetch(`/api/decks/${deckId}/cards/${row.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    setBusy(false);
    setOpen(false);
    router.refresh();
  }

  async function remove() {
    setBusy(true);
    const res = await fetch(`/api/decks/${deckId}/cards/${row.id}`, { method: "DELETE" });
    setBusy(false);
    if (res.ok) {
      const { removed } = await res.json();
      window.dispatchEvent(new CustomEvent(REMOVED_EVENT, { detail: { removed, name: row.name } }));
      router.refresh();
    }
  }

  async function add(board: "main" | "maybe") {
    setBusy(true);
    await fetch(`/api/decks/${deckId}/cards`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ oracleId: row.oracleId, board }) });
    setBusy(false);
    router.refresh();
  }

  const btn = "inline-flex min-h-11 min-w-11 items-center justify-center rounded-md px-2 text-sm hover:bg-background disabled:opacity-50";
  if (row.board === "upgrade" || row.board === "wanted") {
    return (
      <div className="flex shrink-0 gap-1">
        <button className={`${btn} border border-line`} disabled={busy} onClick={() => add("main")}>
          Add
        </button>
        <button className={btn} disabled={busy} onClick={() => add("maybe")} title="Add to maybeboard">
          Maybe
        </button>
      </div>
    );
  }
  return (
    <div className="relative flex shrink-0 items-center gap-1">
      <button
        className={btn}
        disabled={busy}
        aria-pressed={row.locked}
        onClick={() => patch({ locked: !row.locked })}
        title={row.locked ? "Locked: rebuilding keeps it. Tap to unlock." : "Lock so rebuilding keeps it"}
        aria-label={row.locked ? `Unlock ${row.name}` : `Lock ${row.name}`}
      >
        <span aria-hidden className={row.locked ? "text-accent" : "text-muted"}>
          {row.locked ? "●" : "○"}
        </span>
      </button>
      <button className={btn} disabled={busy} onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label={`More for ${row.name}`}>
        <span aria-hidden>⋯</span>
      </button>
      {open && (
        <div className="absolute right-0 top-11 z-10 w-48 rounded-md border border-line bg-panel p-1 shadow-lg">
          {row.board === "main" ? (
            <button className={`${btn} w-full justify-start`} onClick={() => patch({ board: "maybe" })}>
              Move to maybeboard
            </button>
          ) : (
            <button className={`${btn} w-full justify-start`} onClick={() => patch({ board: "main" })}>
              Move to deck
            </button>
          )}
          {row.state === "not-owned" && (
            <button className={`${btn} w-full justify-start`} onClick={() => patch({ acquire: row.acquire === "proxy" ? "buy" : "proxy" })}>
              {row.acquire === "proxy" ? "Mark as buy" : "Mark as proxy"}
            </button>
          )}
          <button className={`${btn} w-full justify-start text-danger`} onClick={remove}>
            Remove
          </button>
        </div>
      )}
    </div>
  );
}

/** Shows "Removed X · Undo" after a removal anywhere on the page. */
export function DeckUndoBar({ deckId }: { deckId: number }) {
  const router = useRouter();
  const [last, setLast] = useState<{ removed: unknown; name: string }>();
  useEffect(() => {
    const on = (e: Event) => setLast((e as CustomEvent).detail);
    window.addEventListener(REMOVED_EVENT, on);
    return () => window.removeEventListener(REMOVED_EVENT, on);
  }, []);
  if (!last) return null;
  async function undo() {
    await fetch(`/api/decks/${deckId}/cards/restore`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ removed: last!.removed }) });
    setLast(undefined);
    router.refresh();
  }
  return (
    <div role="status" className="fixed inset-x-4 bottom-4 z-20 mx-auto flex max-w-md items-center justify-between gap-3 rounded-lg border border-line bg-panel px-4 py-2 shadow-lg">
      <span className="min-w-0 truncate text-sm">Removed {last.name}</span>
      <span className="flex shrink-0 gap-1">
        <button className="inline-flex min-h-11 items-center px-2 text-sm font-medium text-accent" onClick={undo}>
          Undo
        </button>
        <button className="inline-flex min-h-11 items-center px-2 text-sm text-muted" onClick={() => setLast(undefined)} aria-label="Dismiss">
          ✕
        </button>
      </span>
    </div>
  );
}
