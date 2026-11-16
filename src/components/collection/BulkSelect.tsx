"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { MoveSheet } from "@/components/MoveSheet";
import { DeckToast, showDeckToast } from "@/components/deck/DeckRowActions";
import { Sheet } from "@/components/deck/Sheet";
import type { Place } from "@/lib/collection/locations";

type Action = { kind: "update"; patch: { location?: string; condition?: string; proxy?: boolean } } | { kind: "remove" };
type Result = { stacks: number; copies: number; merged: number; inDecks: number };
type Open = "move" | "condition" | "proxy" | "remove" | null;

const CONDITIONS = [
  { value: "M", label: "Mint" },
  { value: "NM", label: "Near Mint" },
  { value: "LP", label: "Lightly Played" },
  { value: "MP", label: "Moderately Played" },
  { value: "HP", label: "Heavily Played" },
  { value: "DMG", label: "Damaged" },
];

const cards = (n: number) => `${n.toLocaleString("en-AU")} ${n === 1 ? "card" : "cards"}`;
const undoBulk = () => fetch("/api/collection/bulk/undo", { method: "POST" });

/**
 * "Select" on the Collection page: tap cards to tick them (or "Select all" for everything the view
 * matches), then move them to a box or binder, set their condition, mark them as proxies, or remove
 * them. An action covers every copy of the ticked cards that the current view shows, so with a box
 * or binder filter on, only the copies in that place change. Each change comes with Undo.
 *
 * The list itself is the server-rendered CollectionList (children): each row is an <li data-oracle>,
 * and in select mode a tap on a row ticks it instead of opening the card.
 */
export function BulkSelect({
  query,
  total,
  places,
  current,
  children,
}: {
  /** The page's query string (filters, search), so the server acts on the same view. */
  query: string;
  /** Different cards the view matches (all pages). */
  total: number;
  places: Place[];
  /** The place filter, when there is one. */
  current?: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const box = useRef<HTMLDivElement>(null);
  const [selecting, setSelecting] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [all, setAll] = useState(false);
  const [open, setOpen] = useState<Open>(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<Result>();

  // Mark ticked rows (the rows are server-rendered, so their state is set on the DOM).
  useEffect(() => {
    for (const li of box.current?.querySelectorAll<HTMLElement>("li[data-oracle]") ?? []) {
      const on = selecting && (all || picked.has(li.dataset.oracle!));
      li.toggleAttribute("data-selected", on);
      li.querySelector("a")?.setAttribute("aria-pressed", String(on));
      if (!selecting) li.querySelector("a")?.removeAttribute("aria-pressed");
    }
  }, [selecting, picked, all, children]);

  // A new view (search, filter, page) starts a new selection.
  useEffect(() => {
    setPicked(new Set());
    setAll(false);
  }, [query]);

  function onClickCapture(e: React.MouseEvent) {
    if (!selecting) return;
    const li = (e.target as HTMLElement).closest<HTMLElement>("li[data-oracle]");
    if (!li) return;
    e.preventDefault();
    e.stopPropagation();
    const id = li.dataset.oracle!;
    if (all) {
      // Untick one from "all": switch to the rows on this page minus that one.
      const rows = [...(box.current?.querySelectorAll<HTMLElement>("li[data-oracle]") ?? [])].map((x) => x.dataset.oracle!);
      setAll(false);
      setPicked(new Set(rows.filter((r) => r !== id)));
      return;
    }
    setPicked((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const count = all ? total : picked.size;
  const scope = current ? ` in ${current}` : "";
  const body = (action: Action, preview = false) =>
    JSON.stringify({ query, oracleIds: all ? undefined : [...picked], action, preview });

  async function run(action: Action, done: (r: Result) => string) {
    setBusy(true);
    const res = await fetch("/api/collection/bulk", { method: "POST", headers: { "Content-Type": "application/json" }, body: body(action) }).catch(() => undefined);
    setBusy(false);
    if (!res?.ok) {
      showDeckToast({ message: "That didn’t save. Try again.", error: true });
      return;
    }
    const r = (await res.json()) as Result;
    setOpen(null);
    setSelecting(false);
    setPicked(new Set());
    setAll(false);
    showDeckToast(r.stacks ? { message: done(r), undo: undoBulk } : { message: "Nothing needed changing." });
    router.refresh();
  }

  async function askRemove() {
    setOpen("remove");
    setPreview(undefined);
    const res = await fetch("/api/collection/bulk", { method: "POST", headers: { "Content-Type": "application/json" }, body: body({ kind: "remove" }, true) }).catch(() => undefined);
    if (res?.ok) setPreview(await res.json());
  }

  const btn = "inline-flex min-h-11 flex-1 items-center justify-center rounded-xl px-2 text-sm font-medium hover:bg-(--panel-2) disabled:opacity-40";
  return (
    <div className="space-y-2">
      <div className="flex min-h-11 items-center justify-between gap-2">
        {selecting ? (
          <>
            <span className="text-sm tabular-nums" aria-live="polite">
              {count ? `${cards(count)} selected` : "Tap cards to select them"}
            </span>
            <span className="flex items-center">
              {!all && total > 0 && (
                <button type="button" className="inline-flex min-h-11 items-center px-3 text-sm text-(--accent-text)" onClick={() => setAll(true)}>
                  Select all {total.toLocaleString("en-AU")}
                </button>
              )}
              <button
                type="button"
                className="inline-flex min-h-11 items-center px-3 text-sm text-muted hover:text-foreground"
                onClick={() => {
                  setSelecting(false);
                  setPicked(new Set());
                  setAll(false);
                }}
              >
                Done
              </button>
            </span>
          </>
        ) : (
          <>
            <span />
            <button type="button" className="inline-flex min-h-11 items-center rounded-xl px-3 text-sm text-(--accent-text) hover:bg-panel" onClick={() => setSelecting(true)}>
              Select
            </button>
          </>
        )}
      </div>

      <div ref={box} onClickCapture={onClickCapture} data-selecting={selecting ? "" : undefined} className="bulk-select">
        {children}
      </div>

      {selecting && (
        <div
          role="toolbar"
          aria-label="Change the selected cards"
          className="fixed inset-x-3 bottom-[calc(84px+env(safe-area-inset-bottom,0px))] z-40 mx-auto flex max-w-xl gap-1 rounded-2xl border border-line bg-(--panel-2) p-1 shadow-xl min-[900px]:bottom-6"
        >
          <button type="button" className={btn} disabled={!count} onClick={() => setOpen("move")}>
            Move
          </button>
          <button type="button" className={btn} disabled={!count} onClick={() => setOpen("condition")}>
            Condition
          </button>
          <button type="button" className={btn} disabled={!count} onClick={() => setOpen("proxy")}>
            Proxy
          </button>
          <button type="button" className={`${btn} text-danger`} disabled={!count} onClick={askRemove}>
            Remove
          </button>
        </div>
      )}

      {open === "move" && (
        <MoveSheet
          title={`Move ${cards(count)}`}
          sub={`Every copy of them${scope} goes to the place you pick. Decks keep their copies.`}
          places={places}
          current={current}
          onPick={async (to) =>
            run({ kind: "update", patch: { location: to } }, (r) => `Moved ${cards(r.copies)} to ${to}${r.merged ? `, joining ${r.merged} matching ${r.merged === 1 ? "stack" : "stacks"}` : ""}`)
          }
          onClose={() => setOpen(null)}
        />
      )}
      {open === "condition" && (
        <Sheet title={`Condition of ${cards(count)}`} sub={`Sets every copy of them${scope}.`} onClose={() => setOpen(null)}>
          <ul className="pb-1">
            {CONDITIONS.map((c) => (
              <li key={c.value}>
                <button
                  type="button"
                  className="sheet-link justify-between disabled:opacity-50"
                  disabled={busy}
                  onClick={() => run({ kind: "update", patch: { condition: c.value } }, (r) => `${cards(r.copies)} set to ${c.label}`)}
                >
                  {c.label}
                  <span className="text-[13px] text-muted">{c.value}</span>
                </button>
              </li>
            ))}
          </ul>
        </Sheet>
      )}
      {open === "proxy" && (
        <Sheet title={`${cards(count)}: real or proxy?`} sub="Proxies count as owned but are never valued, and decks use a real copy first." onClose={() => setOpen(null)}>
          <ul className="pb-1">
            <li>
              <button type="button" className="sheet-link disabled:opacity-50" disabled={busy} onClick={() => run({ kind: "update", patch: { proxy: true } }, (r) => `Marked ${cards(r.copies)} as proxies`)}>
                Mark as proxies
              </button>
            </li>
            <li>
              <button type="button" className="sheet-link disabled:opacity-50" disabled={busy} onClick={() => run({ kind: "update", patch: { proxy: false } }, (r) => `Marked ${cards(r.copies)} as real cards`)}>
                Mark as real cards
              </button>
            </li>
          </ul>
        </Sheet>
      )}
      {open === "remove" && (
        <Sheet title={`Remove ${cards(count)} from your collection?`} onClose={() => setOpen(null)}>
          <div className="space-y-3 px-3 pb-2 text-sm">
            <p className="text-muted">
              {preview
                ? `That’s ${cards(preview.copies)} in ${preview.stacks} ${preview.stacks === 1 ? "stack" : "stacks"}${scope}.${
                    preview.inDecks ? ` ${cards(preview.inDecks)} of them ${preview.inDecks === 1 ? "is" : "are"} in decks, which will show ${preview.inDecks === 1 ? "it" : "them"} as missing.` : ""
                  } You can undo this straight after.`
                : "Counting…"}
            </p>
            <button
              type="button"
              disabled={busy || !preview}
              onClick={() => run({ kind: "remove" }, (r) => `Removed ${cards(r.copies)}`)}
              className="inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-danger px-4 font-semibold text-white disabled:opacity-50"
            >
              {busy ? "Removing…" : "Remove"}
            </button>
          </div>
        </Sheet>
      )}
      <DeckToast />
    </div>
  );
}
