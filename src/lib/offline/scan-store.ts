"use client";

/**
 * Scans that couldn't reach the app (no signal at the shop or the game store), kept on this device
 * in IndexedDB so they survive a reload, and read as soon as it's back. Only pictures that never got
 * to the server wait here; one the server couldn't read stays in the page's "Couldn't read" list.
 */

export type WaitingScan = { key: string; image: Blob; kind: "card" | "photo"; at: number };

const DB = "tutor-scans";
const STORE = "waiting";

function open(): Promise<IDBDatabase | undefined> {
  if (typeof indexedDB === "undefined") return Promise.resolve(undefined);
  return new Promise((resolve) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "key" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(undefined);
  });
}

async function run<T>(mode: IDBTransactionMode, f: (s: IDBObjectStore) => IDBRequest<T>): Promise<T | undefined> {
  const db = await open();
  if (!db) return undefined;
  return new Promise((resolve) => {
    const tx = db.transaction(STORE, mode);
    const req = f(tx.objectStore(STORE));
    tx.oncomplete = () => (db.close(), resolve(req.result));
    tx.onerror = tx.onabort = () => (db.close(), resolve(undefined));
  });
}

export const keepWaitingScan = (s: WaitingScan) => run("readwrite", (st) => st.put(s)).catch(() => undefined);

export const dropWaitingScan = (key: string) => run("readwrite", (st) => st.delete(key)).catch(() => undefined);

/** Oldest first. */
export async function waitingScans(): Promise<WaitingScan[]> {
  const all = ((await run("readonly", (st) => st.getAll()).catch(() => undefined)) ?? []) as WaitingScan[];
  return all.sort((a, b) => a.at - b.at);
}
