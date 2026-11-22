"use client";

import { useSyncExternalStore } from "react";
import { editRequest, enqueue, inverseEdit, outcomeOf, type DeckEdit, type NewDeckEdit } from "./deck-edits";

/**
 * Deck edits kept on this device until the server has them. An edit shows on the page at once
 * (src/components/offline/PendingRow.tsx) and is sent straight away when the app can be reached;
 * offline, or when the server doesn't answer, it waits here (in localStorage, so it survives a
 * reload or the app closing) and goes, in order, when the app is back. See docs/speed.md, stage 3.
 *
 * After a send, OutboxRunner redraws the page from the server; the sent edits keep showing until
 * that redraw lands, so a removed row doesn't flash back.
 */

const KEY = "tutor-outbox-v1";
/** Edits sent in the last day, with when the server had them (see SentEdit). */
const SENT_KEY = "tutor-outbox-sent-v1";
const SENT_KEEP_MS = 24 * 60 * 60 * 1000;
const CHANGED = "tutor-outbox";

/** Why the queue isn't moving: nothing to send, sending, offline/unreachable, or the app is locked. */
export type OutboxState = "idle" | "sending" | "waiting" | "locked";

/**
 * An edit the server has, and when its answer came back. The device's copy of a deck
 * (src/lib/offline/deck-snapshot.ts) applies the ones sent after it was fetched, so it shows them
 * until it's fetched again.
 */
export type SentEdit = { edit: DeckEdit; doneAt: number };
type Sent = SentEdit & { answer: unknown; gen: number };
/** The "tutor-outbox-sent" event: edits up to `gen` reached the server, for these decks. */
export type OutboxSent = { gen: number; decks: number[] };
type Snapshot = { queue: DeckEdit[]; settling: DeckEdit[]; sent: SentEdit[]; state: OutboxState; failed: DeckEdit[] };

let memory: DeckEdit[] = [];
let state: OutboxState = "idle";
let failed: DeckEdit[] = [];
/** Sent edits (newest last): this session's, for Undo and for showing until the page is redrawn, and the last day's from before. */
let sent: Sent[] | undefined;
/** Bumped when a send finishes; a redraw started after gen N clears edits sent at or before N. */
let gen = 0;
let settledGen = 0;
let snapshot: Snapshot | undefined;

function read(): DeckEdit[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as DeckEdit[]) : [];
  } catch {
    return memory;
  }
}

function write(queue: DeckEdit[]) {
  memory = queue;
  try {
    if (queue.length) window.localStorage.setItem(KEY, JSON.stringify(queue));
    else window.localStorage.removeItem(KEY);
  } catch {
    // Private mode or storage full: the queue lives in memory until the page closes.
  }
  changed();
}

/** The sent list, starting from the last day's kept on the device (gen 0: already on the page). */
function sentList(): Sent[] {
  if (!sent) {
    sent = [];
    try {
      const kept = JSON.parse(window.localStorage.getItem(SENT_KEY) ?? "[]") as SentEdit[];
      sent = kept.filter((s) => Date.now() - s.doneAt < SENT_KEEP_MS).map((s) => ({ ...s, answer: undefined, gen: 0 }));
    } catch {
      // Unreadable: start empty.
    }
  }
  return sent;
}

function keepSent() {
  try {
    const recent = sentList()
      .filter((s) => Date.now() - s.doneAt < SENT_KEEP_MS)
      .slice(-50)
      .map(({ edit, doneAt }) => ({ edit, doneAt }));
    window.localStorage.setItem(SENT_KEY, JSON.stringify(recent));
  } catch {
    // Storage full or unavailable: this session still has them.
  }
}

function changed() {
  snapshot = undefined;
  window.dispatchEvent(new Event(CHANGED));
}

function getSnapshot(): Snapshot {
  if (!snapshot) {
    const list = sentList();
    snapshot = { queue: read(), settling: list.filter((s) => s.gen > settledGen).map((s) => s.edit), sent: list.map(({ edit, doneAt }) => ({ edit, doneAt })), state, failed };
  }
  return snapshot;
}
const EMPTY: Snapshot = { queue: [], settling: [], sent: [], state: "idle", failed: [] };

function subscribe(fn: () => void) {
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) {
      snapshot = undefined;
      fn();
    }
  };
  window.addEventListener(CHANGED, fn);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(CHANGED, fn);
    window.removeEventListener("storage", onStorage);
  };
}

/** The outbox as a page sees it: unsent edits, sent ones not yet on the page, and why it's waiting. */
export function useOutbox(): Snapshot {
  return useSyncExternalStore(subscribe, getSnapshot, () => EMPTY);
}

/** Every edit for this deck the page doesn't show yet (unsent, or sent and waiting for the redraw). */
export function useDeckEdits(deckId: number): DeckEdit[] {
  const s = useOutbox();
  return [...s.settling, ...s.queue].filter((e) => e.deckId === deckId);
}

let counter = 0;

/** Keep an edit and send it as soon as the app can be reached. Returns its key, for Undo. */
export function queueDeckEdit(edit: NewDeckEdit): string {
  const key = `${Date.now().toString(36)}-${(counter++).toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  write(enqueue(read(), { ...edit, key, at: Date.now() } as DeckEdit));
  void flushOutbox();
  return key;
}

/**
 * Undo an edit: an unsent one is simply dropped; one the server has gets the edit that reverses it.
 * False when it can't be undone from here (an added card that's already sent: remove it instead).
 */
export function undoDeckEdit(key: string): boolean {
  const queue = read();
  if (queue.some((e) => e.key === key)) {
    write(queue.filter((e) => e.key !== key));
    return true;
  }
  const done = sentList().find((s) => s.edit.key === key && s.gen > 0);
  const back = done && inverseEdit(done.edit, done.answer);
  if (!back) return false;
  queueDeckEdit(back);
  return true;
}

/** Will an edit made now wait on this device? (For the wording of a toast.) */
export function editsWait(): boolean {
  return state === "waiting" || state === "locked" || (typeof navigator !== "undefined" && navigator.onLine === false);
}

export function dismissFailed() {
  failed = [];
  changed();
}

/** The page has been redrawn from a request started at `upTo`: sent edits up to then now show there. */
export function settle(upTo: number) {
  settledGen = Math.max(settledGen, upTo);
  sent = sentList().slice(-50);
  changed();
}
export const currentGen = () => gen;

let flushing: Promise<number> | undefined;

/**
 * Send waiting edits in order, one at a time (one tab at a time, where the browser has Web Locks).
 * Resolves to how many were sent. Stops at the first that can't be sent now.
 */
export function flushOutbox(): Promise<number> {
  if (typeof window === "undefined") return Promise.resolve(0);
  flushing ??= (async () => {
    try {
      const run = () => sendAll();
      const locks = (navigator as Navigator & { locks?: LockManager }).locks;
      return await (locks ? locks.request("tutor-outbox", run) : run());
    } finally {
      flushing = undefined;
      // An edit queued as the last send finished: go again.
      if (state === "idle" && read().length) void flushOutbox();
    }
  })();
  return flushing;
}

async function sendAll(): Promise<number> {
  let count = 0;
  const decks = new Set<number>();
  for (;;) {
    const [next] = read();
    if (!next) {
      setState("idle");
      break;
    }
    setState("sending");
    const req = editRequest(next);
    let status: number | "network" = "network";
    let redirected = false;
    let answer: unknown;
    try {
      const res = await fetch(req.url, {
        method: req.method,
        headers: req.body === undefined ? undefined : { "Content-Type": "application/json" },
        body: req.body === undefined ? undefined : JSON.stringify(req.body),
      });
      status = res.status;
      redirected = res.redirected;
      answer = await res.json().catch(() => undefined);
    } catch {
      // Offline, or the server didn't answer.
    }
    const outcome = outcomeOf(next, status, redirected);
    if (outcome === "wait" || outcome === "locked") {
      setState(outcome === "locked" ? "locked" : "waiting");
      break;
    }
    // Sent (or never can be): drop it from the queue as it is now (another tab may have changed it).
    if (outcome === "failed") failed = [...failed, next];
    else {
      gen++;
      sentList().push({ edit: next, answer, gen, doneAt: Date.now() });
      keepSent();
      decks.add(next.deckId);
      count++;
    }
    write(read().filter((e) => e.key !== next.key));
  }
  if (count) window.dispatchEvent(new CustomEvent<OutboxSent>("tutor-outbox-sent", { detail: { gen, decks: [...decks] } }));
  return count;
}

function setState(s: OutboxState) {
  if (state === s) return;
  state = s;
  changed();
}

/** Edits waiting to send (any deck). */
export const queuedCount = () => (typeof window === "undefined" ? 0 : read().length);
