"use client";

import { useSyncExternalStore } from "react";

/**
 * Collection changes kept on this device until the server has them, the way deck edits are
 * (src/lib/offline/outbox.ts): a copy count, a move to another box, what you paid, or a card the
 * scanner (or "Add cards") added. Each is tried straight away; when the app can't be reached it waits
 * here (in localStorage, so it survives a reload) and is sent, in order, when the app is back.
 * OutboxRunner sends it alongside the deck edits and redraws the page after.
 */

const KEY = "tutor-collection-outbox-v1";
const CHANGED = "tutor-collection-outbox";

/** One write: the same API call the page would have made, and a line saying what it is. */
export type CollectionWrite = { key: string; at: number; label: string; url: string; method: "POST" | "PATCH" | "DELETE"; body?: unknown; /** Writes queued together (a scan and its deck add) go and are cancelled together. */ group?: string };
export type NewCollectionWrite = Omit<CollectionWrite, "key" | "at">;

export type CollectionOutcome = "done" | "wait" | "locked" | "failed";

/** What to do with an answer: as for deck edits, but a stack that's already gone has had its change. */
export function collectionOutcome(w: Pick<CollectionWrite, "method">, status: number | "network", redirected = false): CollectionOutcome {
  if (status === "network" || status >= 500 || status === 408 || status === 429) return "wait";
  if (status === 401 || status === 403 || redirected) return "locked";
  if (status >= 200 && status < 300) return "done";
  if (status === 404 && w.method !== "POST") return "done";
  return "failed";
}

let memory: CollectionWrite[] = [];
type State = "idle" | "sending" | "waiting" | "locked";
let state: State = "idle";
let failed: CollectionWrite[] = [];
/** Answers to writes sent this session, by key (the scanner's Undo needs the stack a queued add made). */
const answers = new Map<string, unknown>();
let snapshot: { queue: CollectionWrite[]; state: State; failed: CollectionWrite[] } | undefined;

function read(): CollectionWrite[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as CollectionWrite[]) : [];
  } catch {
    return memory;
  }
}

function write(queue: CollectionWrite[]) {
  memory = queue;
  try {
    if (queue.length) window.localStorage.setItem(KEY, JSON.stringify(queue));
    else window.localStorage.removeItem(KEY);
  } catch {
    // Private mode or storage full: the queue lives in memory until the page closes.
  }
  changed();
}

function changed() {
  snapshot = undefined;
  window.dispatchEvent(new Event(CHANGED));
}

const EMPTY: { queue: CollectionWrite[]; state: State; failed: CollectionWrite[] } = { queue: [], state: "idle", failed: [] };

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

export function useCollectionOutbox() {
  return useSyncExternalStore(subscribe, () => (snapshot ??= { queue: read(), state, failed }), () => EMPTY);
}

let counter = 0;
const newKey = () => `${Date.now().toString(36)}-${(counter++).toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

/** Keep writes (in order) and send them as soon as the app can be reached. Returns their keys. */
export function queueCollectionWrites(writes: NewCollectionWrite[]): string[] {
  const group = writes.length > 1 ? newKey() : undefined;
  const made = writes.map((w) => ({ ...w, key: newKey(), at: Date.now(), ...(group ? { group } : {}) }));
  write([...read(), ...made]);
  void flushCollectionOutbox();
  return made.map((w) => w.key);
}

/** Drop a write that hasn't gone yet (and the rest of its group). False when it's already sent. */
export function cancelCollectionWrite(key: string): boolean {
  const queue = read();
  const w = queue.find((x) => x.key === key);
  if (!w) return false;
  write(queue.filter((x) => x.key !== key && !(w.group && x.group === w.group)));
  return true;
}

/** The server's answer to a write sent this session, if it has gone. */
export const sentAnswer = (key: string) => answers.get(key);

export const collectionQueued = () => (typeof window === "undefined" ? 0 : read().length);

export function dismissCollectionFailed() {
  failed = [];
  changed();
}

/**
 * Send a write now if the app answers, else keep it to send later. Resolves to the server's answer
 * (`queued: true` when it's waiting on this device), so a page can carry on either way.
 */
export async function sendOrQueue(w: NewCollectionWrite): Promise<{ queued: false; ok: boolean; answer: unknown } | { queued: true; key: string }> {
  // Writes already waiting go first, so this one can't overtake them.
  if (collectionQueued() === 0) {
    try {
      const res = await fetch(w.url, { method: w.method, headers: w.body === undefined ? undefined : { "Content-Type": "application/json" }, body: w.body === undefined ? undefined : JSON.stringify(w.body) });
      const outcome = collectionOutcome(w, res.status, res.redirected);
      if (outcome !== "wait") return { queued: false, ok: outcome === "done", answer: await res.json().catch(() => undefined) };
    } catch {
      // Offline, or the server didn't answer: keep it.
    }
  }
  const [key] = queueCollectionWrites([w]);
  return { queued: true, key };
}

let flushing: Promise<number> | undefined;

/** Send waiting writes in order, one tab at a time. Resolves to how many were sent. */
export function flushCollectionOutbox(): Promise<number> {
  if (typeof window === "undefined") return Promise.resolve(0);
  flushing ??= (async () => {
    try {
      const locks = (navigator as Navigator & { locks?: LockManager }).locks;
      return await (locks ? locks.request("tutor-collection-outbox", sendAll) : sendAll());
    } finally {
      flushing = undefined;
      if (state === "idle" && read().length) void flushCollectionOutbox();
    }
  })();
  return flushing;
}

async function sendAll(): Promise<number> {
  let count = 0;
  for (;;) {
    const [next] = read();
    if (!next) {
      setState("idle");
      break;
    }
    setState("sending");
    let status: number | "network" = "network";
    let redirected = false;
    let answer: unknown;
    try {
      const res = await fetch(next.url, {
        method: next.method,
        headers: next.body === undefined ? undefined : { "Content-Type": "application/json" },
        body: next.body === undefined ? undefined : JSON.stringify(next.body),
      });
      status = res.status;
      redirected = res.redirected;
      answer = await res.json().catch(() => undefined);
    } catch {
      // Offline, or the server didn't answer.
    }
    const outcome = collectionOutcome(next, status, redirected);
    if (outcome === "wait" || outcome === "locked") {
      setState(outcome === "locked" ? "locked" : "waiting");
      break;
    }
    if (outcome === "failed") failed = [...failed, next];
    else {
      answers.set(next.key, answer);
      count++;
    }
    write(read().filter((e) => e.key !== next.key));
  }
  if (count) window.dispatchEvent(new CustomEvent("tutor-collection-sent", { detail: { count } }));
  return count;
}

function setState(s: State) {
  if (state === s) return;
  state = s;
  changed();
}
