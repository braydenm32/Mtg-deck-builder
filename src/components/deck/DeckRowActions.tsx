"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Sheet } from "./Sheet";

/*
 * Row actions for the deck tabs in the new look. Every action is a tap: the lock is a button, and "⋯"
 * opens a sheet (sliding up on a phone) with the rest. Each save says it saved in a toast, and the
 * ones you might regret (remove, move, proxy) come with Undo. The calls are the same deck card API the
 * old look uses.
 */

type Row = {
  id: number;
  oracleId: string;
  name: string;
  locked: boolean;
  board: string;
  acquire: "buy" | "proxy" | null;
  state: string;
  owned: number;
};

const TOAST_EVENT = "deck-toast";
type Toast = { message: string; undo?: () => Promise<unknown>; error?: boolean };

/** Report a save (or a failure) in the deck tabs' toast. */
export function showDeckToast(t: Toast) {
  window.dispatchEvent(new CustomEvent<Toast>(TOAST_EVENT, { detail: t }));
}
const toast = showDeckToast;

const json = (body: unknown): RequestInit => ({ headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

const STATE_TEXT: Record<string, string> = {
  placed: "In your hands",
  free: "You have a free copy",
  shared: "Shared: more decks want it than you own",
  "other-deck": "Every copy is in another deck",
  "not-owned": "Not in your collection",
  "no-data": "No card data",
};

function LockIcon({ locked }: { locked: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="5" y="10.5" width="14" height="9.5" rx="2" />
      <path d={locked ? "M8 10.5V7.5a4 4 0 0 1 8 0v3" : "M8 10.5V7.5a4 4 0 0 1 7.6-1.7"} />
    </svg>
  );
}

const iconBtn = "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl hover:bg-background hover:text-foreground disabled:opacity-50";

/**
 * A card row in the deck or the maybeboard. Tapping the row (its text, passed as children) or "⋯"
 * opens the sheet of actions; the lock is its own one-tap button.
 */
export function DeckRowActions({ deckId, row, children }: { deckId: number; row: Row; children?: React.ReactNode }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const url = `/api/decks/${deckId}/cards/${row.id}`;

  async function send(input: string, init: RequestInit) {
    setBusy(true);
    const res = await fetch(input, init).catch(() => undefined);
    setBusy(false);
    if (!res?.ok) {
      toast({ message: `That didn't save. Try again.`, error: true });
      return undefined;
    }
    return res;
  }

  async function patch(body: Record<string, unknown>, message: string, undo?: Record<string, unknown>) {
    setOpen(false);
    if (!(await send(url, { method: "PATCH", ...json(body) }))) return;
    toast({ message, undo: undo ? () => fetch(url, { method: "PATCH", ...json(undo) }) : undefined });
    router.refresh();
  }

  async function remove() {
    setOpen(false);
    const res = await send(url, { method: "DELETE" });
    if (!res) return;
    const { removed } = await res.json();
    toast({ message: `Removed ${row.name}`, undo: () => fetch(`/api/decks/${deckId}/cards/restore`, { method: "POST", ...json({ removed }) }) });
    router.refresh();
  }

  const item = "sheet-link text-left disabled:opacity-50";
  return (
    <>
      {children && (
        <button
          type="button"
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 self-stretch rounded-lg pl-3 text-left hover:bg-background/40"
          aria-haspopup="dialog"
          onClick={() => setOpen(true)}
        >
          {children}
        </button>
      )}
      <div className="flex shrink-0 items-center">
        <button
          type="button"
          className={`${iconBtn} ${row.locked ? "text-accent" : "text-muted"}`}
          disabled={busy}
          aria-pressed={row.locked}
          aria-label={row.locked ? `Unlock ${row.name}` : `Lock ${row.name}`}
          title={row.locked ? "Locked: rebuilding keeps it. Tap to unlock." : "Lock so rebuilding keeps it"}
          onClick={() => patch({ locked: !row.locked }, row.locked ? `Unlocked ${row.name}` : `Locked ${row.name}: rebuilding keeps it`)}
        >
          <LockIcon locked={row.locked} />
        </button>
        <button type="button" className={`${iconBtn} text-muted`} disabled={busy} aria-haspopup="dialog" aria-expanded={open} aria-label={`More for ${row.name}`} onClick={() => setOpen(true)}>
          <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden>
            <circle cx="5.5" cy="12" r="1.6" />
            <circle cx="12" cy="12" r="1.6" />
            <circle cx="18.5" cy="12" r="1.6" />
          </svg>
        </button>
        {open && (
          <Sheet title={row.name} sub={`${STATE_TEXT[row.state] ?? ""}${row.locked ? " · locked" : ""}`} onClose={() => setOpen(false)}>
            {row.board === "main" ? (
              <button type="button" className={item} disabled={busy} onClick={() => patch({ board: "maybe" }, `Moved ${row.name} to the maybeboard`, { board: "main" })}>
                Move to the maybeboard
              </button>
            ) : (
              <button type="button" className={item} disabled={busy} onClick={() => patch({ board: "main" }, `Moved ${row.name} into the deck`, { board: "maybe" })}>
                Move into the deck
              </button>
            )}
            <button
              type="button"
              className={item}
              disabled={busy}
              onClick={() => patch({ locked: !row.locked }, row.locked ? `Unlocked ${row.name}` : `Locked ${row.name}: rebuilding keeps it`)}
            >
              {row.locked ? "Unlock" : "Lock so rebuilding keeps it"}
            </button>
            {row.state === "not-owned" && (
              <button
                type="button"
                className={item}
                disabled={busy}
                onClick={() =>
                  patch(
                    { acquire: row.acquire === "proxy" ? "buy" : "proxy" },
                    row.acquire === "proxy" ? `${row.name}: to buy` : `${row.name}: to proxy`,
                    { acquire: row.acquire },
                  )
                }
              >
                {row.acquire === "proxy" ? "Mark as buy" : "Mark as proxy"}
              </button>
            )}
            {row.owned > 0 && (
              <Link className={item} href={`/collection/${row.oracleId}`}>
                Open the card page
              </Link>
            )}
            <button type="button" className={`${item} text-danger`} disabled={busy} onClick={remove}>
              Remove from this deck
            </button>
          </Sheet>
        )}
      </div>
    </>
  );
}

/** "Add" and "Maybe" for a suggested card (the Upgrades tab). */
export function DeckAddButtons({ deckId, oracleId, name }: { deckId: number; oracleId: string; name: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function add(board: "main" | "maybe") {
    setBusy(true);
    const res = await fetch(`/api/decks/${deckId}/cards`, { method: "POST", ...json({ oracleId, board }) }).catch(() => undefined);
    setBusy(false);
    toast(res?.ok ? { message: board === "main" ? `Added ${name} to the deck. It's locked, so rebuilding keeps it.` : `Added ${name} to the maybeboard` } : { message: `Couldn't add ${name}. Try again.`, error: true });
    if (res?.ok) router.refresh();
  }
  return (
    <div className="flex shrink-0 items-center gap-1">
      <button type="button" disabled={busy} onClick={() => add("main")} className="inline-flex min-h-11 items-center rounded-xl border border-line px-3 text-sm font-medium hover:bg-background disabled:opacity-50">
        Add
      </button>
      <button type="button" disabled={busy} onClick={() => add("maybe")} title="Add to the maybeboard" className="inline-flex min-h-11 items-center rounded-xl px-2.5 text-sm text-muted hover:text-foreground disabled:opacity-50">
        Maybe
      </button>
    </div>
  );
}

/** The toast every deck action reports to: "Removed Sol Ring · Undo". Sits above the phone's bottom bar. */
export function DeckToast() {
  const router = useRouter();
  const [t, setT] = useState<Toast & { at: number }>();
  useEffect(() => {
    const on = (e: Event) => setT({ ...(e as CustomEvent<Toast>).detail, at: Date.now() });
    window.addEventListener(TOAST_EVENT, on);
    return () => window.removeEventListener(TOAST_EVENT, on);
  }, []);
  // A plain "saved" goes away by itself; one with Undo stays until you dismiss it or do something else.
  useEffect(() => {
    if (!t || t.undo) return;
    const h = setTimeout(() => setT(undefined), 4000);
    return () => clearTimeout(h);
  }, [t]);
  async function undo() {
    const u = t?.undo;
    setT(undefined);
    if (!u) return;
    const res = await u().catch(() => undefined);
    toast(res instanceof Response && !res.ok ? { message: "Couldn't undo that. Try again.", error: true } : { message: "Undone" });
    router.refresh();
  }
  return (
    <div role="status" aria-live="polite" className="pointer-events-none fixed inset-x-4 bottom-[calc(84px+env(safe-area-inset-bottom))] z-[45] mx-auto max-w-md min-[900px]:bottom-6">
      {t && (
        <div
          key={t.at}
          className={`pointer-events-auto flex items-center justify-between gap-3 rounded-2xl border bg-[var(--panel-2)] py-1 pl-4 pr-1 shadow-xl transition-[translate,opacity] duration-200 starting:translate-y-2 starting:opacity-0 ${t.error ? "border-danger" : "border-line"}`}
        >
          <span className={`min-w-0 py-2 text-sm ${t.error ? "text-danger" : ""}`}>{t.message}</span>
          <span className="flex shrink-0">
            {t.undo && (
              <button type="button" className="inline-flex min-h-11 items-center px-3 text-sm font-semibold text-accent" onClick={undo}>
                Undo
              </button>
            )}
            <button type="button" className="inline-flex h-11 w-11 items-center justify-center text-muted" onClick={() => setT(undefined)} aria-label="Dismiss">
              ✕
            </button>
          </span>
        </div>
      )}
    </div>
  );
}
