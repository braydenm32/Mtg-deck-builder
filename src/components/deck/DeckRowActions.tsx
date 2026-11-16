"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { rowOverlay, type Acquire, type Board, type RowPatch } from "@/lib/offline/deck-edits";
import { editsWait, queueDeckEdit, undoDeckEdit, useDeckEdits } from "@/lib/offline/outbox";
import { ROLE_LABELS, ROLES, type Role } from "@/lib/deck/roles";
import { Sheet } from "./Sheet";

/*
 * Row actions for the deck tabs in the new look. Every action is a tap: the lock is a button, and "⋯"
 * opens a sheet (sliding up on a phone) with the rest. Each save says it saved in a toast, and the
 * ones you might regret (remove, move, proxy) come with Undo. The calls are the same deck card API the
 * old look uses, made through the device's outbox (src/lib/offline/outbox.ts): an edit shows at once,
 * and offline it waits on the device until it can be sent.
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
  /** The roles the card counts as in this deck, and whether you set them. */
  roles?: string[];
  customRoles?: boolean;
  tags?: string[];
  /** Tags used on the deck's other cards, to pick from. */
  deckTags?: string[];
  /** A card added on this device that the server doesn't have yet: the add's key (see deck-model.ts). */
  pendingKey?: string;
};

const TOAST_EVENT = "deck-toast";
/** `local`: the undo goes through the outbox, which redraws the page itself once it's sent. */
type Toast = { message: string; undo?: () => Promise<unknown>; error?: boolean; local?: boolean };

/** The last toast, so a tab drawn afresh (on the device, when an edit has to wait) still shows it. */
let last: (Toast & { at: number }) | undefined;
const RECENT_MS = 8000;

/** Report a save (or a failure) in the deck tabs' toast. */
export function showDeckToast(t: Toast) {
  last = { ...t, at: Date.now() };
  window.dispatchEvent(new CustomEvent<Toast>(TOAST_EVENT, { detail: t }));
}
const toast = showDeckToast;

/** A saved edit's toast: "Removed Sol Ring", plus where it is when it can't be sent yet. */
function saved(message: string): string {
  return editsWait() ? `${message}. Saved on this device until it can be sent.` : message;
}

/** Undo for the toast: false (shown as an error) when the edit can't be undone from here. */
const undoing = (key: string) => async () => undoDeckEdit(key);

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
export function DeckRowActions({ deckId, row: server, children }: { deckId: number; row: Row; children?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  // The row as this device's unsent edits leave it (a lock tapped offline shows locked).
  const o = rowOverlay(useDeckEdits(deckId), server);
  const row = {
    ...server,
    locked: o.locked ?? server.locked,
    acquire: o.acquire !== undefined ? o.acquire : server.acquire,
    tags: o.tags ?? server.tags ?? [],
    customRoles: o.roles !== undefined ? o.roles !== null : !!server.customRoles,
    roles: o.roles ?? server.roles ?? [],
  };
  const card = {
    oracleId: row.oracleId,
    name: row.name,
    board: row.board,
    locked: row.locked,
    acquire: row.acquire as Acquire,
    roles: server.customRoles ? (server.roles ?? []) : null,
    tags: server.tags ?? [],
  };

  function patch(body: RowPatch, message: string, undo = false) {
    setOpen(false);
    const key = queueDeckEdit({ kind: "patch", deckId, rowId: row.id, card, patch: body });
    toast({ message: saved(message), undo: undo ? undoing(key) : undefined, local: true });
  }

  function remove() {
    setOpen(false);
    if (row.pendingKey) {
      // Not on the server yet: removing it just drops the add, and Undo adds it again.
      const board = row.board === "maybe" ? "maybe" : "main";
      if (!undoDeckEdit(row.pendingKey)) return toast({ message: `${row.name} is on its way to the deck. Remove it once it’s there.`, error: true });
      return toast({ message: `Removed ${row.name}`, undo: async () => queueDeckEdit({ kind: "add", deckId, oracleId: row.oracleId, name: row.name, board }), local: true });
    }
    const key = queueDeckEdit({ kind: "remove", deckId, rowId: row.id, card });
    toast({ message: saved(`Removed ${row.name}`), undo: undoing(key), local: true });
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
          // A card added on this device is locked already, and has no row on the server to change yet.
          disabled={!!row.pendingKey}
          aria-pressed={row.locked}
          aria-label={row.locked ? `Unlock ${row.name}` : `Lock ${row.name}`}
          title={row.locked ? "Locked: rebuilding keeps it. Tap to unlock." : "Lock so rebuilding keeps it"}
          onClick={() => patch({ locked: !row.locked }, row.locked ? `Unlocked ${row.name}` : `Locked ${row.name}: rebuilding keeps it`)}
        >
          <LockIcon locked={row.locked} />
        </button>
        <button type="button" className={`${iconBtn} text-muted`} aria-haspopup="dialog" aria-expanded={open} aria-label={`More for ${row.name}`} onClick={() => setOpen(true)}>
          <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden>
            <circle cx="5.5" cy="12" r="1.6" />
            <circle cx="12" cy="12" r="1.6" />
            <circle cx="18.5" cy="12" r="1.6" />
          </svg>
        </button>
        {open && (
          <Sheet
            title={row.name}
            sub={row.pendingKey ? "Added on this device, waiting to send" : `${STATE_TEXT[row.state] ?? ""}${row.locked ? " · locked" : ""}`}
            onClose={() => setOpen(false)}
          >
            {row.pendingKey ? null : row.board === "main" ? (
              <button type="button" className={item} onClick={() => patch({ board: "maybe" }, `Moved ${row.name} to the maybeboard`, true)}>
                Move to the maybeboard
              </button>
            ) : (
              <button type="button" className={item} onClick={() => patch({ board: "main" }, `Moved ${row.name} into the deck`, true)}>
                Move into the deck
              </button>
            )}
            {!row.pendingKey && (
              <button
                type="button"
                className={item}
                onClick={() => patch({ locked: !row.locked }, row.locked ? `Unlocked ${row.name}` : `Locked ${row.name}: rebuilding keeps it`)}
              >
                {row.locked ? "Unlock" : "Lock so rebuilding keeps it"}
              </button>
            )}
            {row.state === "not-owned" && !row.pendingKey && (
              <button
                type="button"
                className={item}
                onClick={() =>
                  patch({ acquire: row.acquire === "proxy" ? "buy" : "proxy" }, row.acquire === "proxy" ? `${row.name}: to buy` : `${row.name}: to proxy`, true)
                }
              >
                {row.acquire === "proxy" ? "Mark as buy" : "Mark as proxy"}
              </button>
            )}
            {!row.pendingKey && row.roles !== undefined && (
              <button
                type="button"
                className={item}
                onClick={() => {
                  setOpen(false);
                  setEditing(true);
                }}
              >
                Roles and tags
              </button>
            )}
            {row.owned > 0 && (
              <Link className={item} href={`/collection/${row.oracleId}`}>
                Open the card page
              </Link>
            )}
            <button type="button" className={`${item} text-danger`} onClick={remove}>
              Remove from this deck
            </button>
          </Sheet>
        )}
        {editing && (
          <RolesAndTags
            name={row.name}
            roles={row.roles}
            custom={row.customRoles}
            tags={row.tags}
            deckTags={server.deckTags ?? []}
            onClose={() => setEditing(false)}
            onSave={(body, message) => {
              setEditing(false);
              patch(body, message, true);
            }}
          />
        )}
      </div>
    </>
  );
}

const CHOOSABLE = ROLES.filter((r) => r !== "land");

/**
 * Change what a card counts as in this deck (the Health checklist counts it the way you say), and
 * give it your own tags. Saving locks the card so a rebuild keeps your changes.
 */
function RolesAndTags({
  name,
  roles: initialRoles,
  custom,
  tags: initialTags,
  deckTags,
  onClose,
  onSave,
}: {
  name: string;
  roles: string[];
  custom: boolean;
  tags: string[];
  deckTags: string[];
  onClose: () => void;
  onSave: (patch: RowPatch, message: string) => void;
}) {
  const land = initialRoles.includes("land");
  const [roles, setRoles] = useState<Set<string>>(new Set(initialRoles.filter((r) => r !== "land")));
  const [auto, setAuto] = useState(!custom);
  const [tags, setTags] = useState<string[]>(initialTags);
  const [draft, setDraft] = useState("");
  const pick = deckTags.filter((t) => !tags.includes(t)).slice(0, 12);
  const chip = (on: boolean) =>
    `inline-flex min-h-10 items-center rounded-full border px-3.5 text-sm ${on ? "border-accent bg-accent/15 text-foreground" : "border-line text-muted hover:text-foreground"}`;

  function addTag(t: string) {
    const v = t.trim().slice(0, 30);
    if (v && !tags.includes(v) && tags.length < 8) setTags([...tags, v]);
    setDraft("");
  }

  function save() {
    const finalTags = draft.trim() ? [...new Set([...tags, draft.trim().slice(0, 30)])].slice(0, 8) : tags;
    const patch: RowPatch = {};
    const nextRoles = auto ? null : [...(land ? ["land"] : []), ...CHOOSABLE.filter((r) => roles.has(r))];
    const sameRoles = auto ? !custom : custom && JSON.stringify(nextRoles) === JSON.stringify(initialRoles);
    if (!sameRoles) patch.roles = nextRoles;
    if (JSON.stringify(finalTags) !== JSON.stringify(initialTags)) patch.tags = finalTags;
    if (!Object.keys(patch).length) return onClose();
    onSave(patch, patch.roles !== undefined ? (auto ? `${name}: automatic roles` : `${name}: roles saved and locked`) : `${name}: tags saved and locked`);
  }

  return (
    <Sheet title={name} sub="Roles change what the deck’s Health counts. Saving locks the card, so a rebuild keeps it." onClose={onClose}>
      <div className="space-y-4 px-3 pb-2">
        <fieldset className="space-y-2">
          <legend className="text-sm font-semibold">Counts as</legend>
          <div className="flex flex-wrap gap-2">
            {CHOOSABLE.map((r) => (
              <button
                key={r}
                type="button"
                aria-pressed={!auto && roles.has(r)}
                className={chip(roles.has(r))}
                onClick={() => {
                  const next = new Set(roles);
                  if (next.has(r)) next.delete(r);
                  else next.add(r);
                  setRoles(next);
                  setAuto(false);
                }}
              >
                {ROLE_LABELS[r as Role]}
              </button>
            ))}
          </div>
          <label className="flex min-h-11 items-center gap-3 text-sm">
            <input
              type="checkbox"
              className="h-5 w-5"
              checked={auto}
              onChange={(e) => {
                setAuto(e.target.checked);
                if (e.target.checked) setRoles(new Set(initialRoles.filter((r) => r !== "land")));
              }}
            />
            Work it out from the card text{custom ? "" : " (as now)"}
          </label>
        </fieldset>
        <fieldset className="space-y-2">
          <legend className="text-sm font-semibold">Your tags</legend>
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {tags.map((t) => (
                <button key={t} type="button" className={chip(true)} aria-label={`Remove tag ${t}`} onClick={() => setTags(tags.filter((x) => x !== t))}>
                  {t} <span aria-hidden className="ml-1.5 text-muted">×</span>
                </button>
              ))}
            </div>
          )}
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              addTag(draft);
            }}
          >
            <input
              className="h-11 min-w-0 flex-1 rounded-xl border border-line bg-background px-3 text-base"
              value={draft}
              maxLength={30}
              placeholder="Wincon, Swap out, Pet card…"
              aria-label="New tag"
              onChange={(e) => setDraft(e.target.value)}
            />
            <button type="submit" className="inline-flex min-h-11 items-center rounded-xl border border-line px-4 text-sm font-medium" disabled={!draft.trim() || tags.length >= 8}>
              Add
            </button>
          </form>
          {pick.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {pick.map((t) => (
                <button key={t} type="button" className={chip(false)} onClick={() => addTag(t)}>
                  + {t}
                </button>
              ))}
            </div>
          )}
        </fieldset>
        <button type="button" className="inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-accent px-4 font-semibold text-accent-fg" onClick={save}>
          Save
        </button>
      </div>
    </Sheet>
  );
}

/** "Add" and "Maybe" for a suggested card (the Upgrades tab). */
export function DeckAddButtons({ deckId, oracleId, name }: { deckId: number; oracleId: string; name: string }) {
  function add(board: Board) {
    const key = queueDeckEdit({ kind: "add", deckId, oracleId, name, board });
    const wait = editsWait();
    toast({
      message: saved(board === "main" ? (wait ? `Added ${name} to the deck` : `Added ${name} to the deck. It's locked, so rebuilding keeps it.`) : `Added ${name} to the maybeboard`),
      // Until it's sent, Undo just drops it.
      undo: wait ? undoing(key) : undefined,
      local: true,
    });
  }
  return (
    <div className="flex shrink-0 items-center gap-1">
      <button type="button" onClick={() => add("main")} className="inline-flex min-h-11 items-center rounded-xl border border-line px-3 text-sm font-medium hover:bg-background disabled:opacity-50">
        Add
      </button>
      <button type="button" onClick={() => add("maybe")} title="Add to the maybeboard" className="inline-flex min-h-11 items-center rounded-xl px-2.5 text-sm text-muted hover:text-foreground disabled:opacity-50">
        Maybe
      </button>
    </div>
  );
}

/** The toast every deck action reports to: "Removed Sol Ring · Undo". Sits above the phone's bottom bar. */
export function DeckToast() {
  const router = useRouter();
  // A toast from just now (this tab was drawn afresh after it was shown) carries on here.
  const [t, setT] = useState<(Toast & { at: number }) | undefined>(() => (last && Date.now() - last.at < RECENT_MS ? last : undefined));
  useEffect(() => {
    const on = (e: Event) => setT(last ?? { ...(e as CustomEvent<Toast>).detail, at: Date.now() });
    window.addEventListener(TOAST_EVENT, on);
    return () => window.removeEventListener(TOAST_EVENT, on);
  }, []);
  // A plain "saved" goes away by itself; one with Undo stays until you dismiss it or do something else.
  useEffect(() => {
    if (!t || t.undo) return;
    const h = setTimeout(
      () => {
        setT(undefined);
        if (last?.at === t.at) last = undefined;
      },
      Math.max(0, 4000 - (Date.now() - t.at)),
    );
    return () => clearTimeout(h);
  }, [t]);
  async function undo() {
    const u = t?.undo;
    const local = t?.local;
    setT(undefined);
    last = undefined;
    if (!u) return;
    const res = await u().catch(() => undefined);
    const failed = (res instanceof Response && !res.ok) || res === false;
    toast(failed ? { message: local ? "That can't be undone here. Change it from its row." : "Couldn't undo that. Try again.", error: true } : { message: "Undone" });
    if (!local) router.refresh();
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
            <button
              type="button"
              className="inline-flex h-11 w-11 items-center justify-center text-muted"
              onClick={() => {
                setT(undefined);
                last = undefined;
              }}
              aria-label="Dismiss"
            >
              ✕
            </button>
          </span>
        </div>
      )}
    </div>
  );
}
