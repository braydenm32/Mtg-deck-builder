import { after } from "next/server";

/**
 * Run `task` after the response has gone out, so a page never waits for it. On Vercel the function
 * stays alive until the task finishes (Next's `after`, which uses waitUntil).
 *
 * Returns false outside a request (scripts, tests), where nothing can run after a response: the
 * caller then does the work inline, as it always did.
 */
export function inBackground(task: Promise<unknown> | (() => Promise<unknown>)): boolean {
  try {
    after(async () => {
      try {
        await (typeof task === "function" ? task() : task);
      } catch (e) {
        console.error("[background]", e);
      }
    });
    return true;
  } catch {
    return false;
  }
}

const running = new Set<string>();

/**
 * `inBackground`, at most once at a time per `key` (a page that looks the same thing up twice, or
 * two quick visits, refresh it once). True when the work is in hand, whether queued now or already.
 */
export function refreshInBackground(key: string, task: () => Promise<unknown>): boolean {
  if (running.has(key)) return true;
  const queued = inBackground(async () => {
    try {
      await task();
    } finally {
      running.delete(key);
    }
  });
  if (queued) running.add(key);
  return queued;
}
