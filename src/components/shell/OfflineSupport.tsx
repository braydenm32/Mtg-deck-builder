"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { refreshCardIndex } from "@/lib/offline/card-index";
import { useOutbox } from "@/lib/offline/outbox";

/**
 * The page side of the service worker (public/sw.js, docs/speed.md):
 * - registers it (production builds only),
 * - when this page was shown from the copy saved on the device, refreshes it as soon as the newer copy
 *   arrives, with the usual progress bar meanwhile,
 * - says so when the device is offline,
 * - asks the worker to save the main pages and every deck once the page has settled,
 * - keeps the card list for searching offline fresh (src/lib/offline/card-index.ts).
 */
export function OfflineSupport() {
  const router = useRouter();
  const [offline, setOffline] = useState(false);
  /** The device is online, but the app's server didn't answer (bad signal, or it's down). */
  const [unreachable, setUnreachable] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [refreshing, startRefresh] = useTransition();
  const waiting = useOutbox().queue.length;

  useEffect(() => {
    setOffline(!navigator.onLine);
    const on = () => (setOffline(false), setUnreachable(false));
    const off = () => setOffline(true);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  // Once things are quiet, keep the card list on the device fresh (for adding cards offline).
  useEffect(() => {
    const t = window.setTimeout(() => void refreshCardIndex(), 5000);
    return () => window.clearTimeout(t);
  }, []);

  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    const sw = navigator.serviceWorker;
    const here = () => window.location.origin + window.location.pathname + window.location.search;
    let fromCache = false;
    // The refreshed page is live data again.
    const refresh = () => {
      setSavedAt(null);
      startRefresh(() => router.refresh());
    };

    function onMessage(e: MessageEvent) {
      const d = e.data as { type?: string; url?: string; fromCache?: boolean; savedAt?: string | null; updated?: boolean; unreachable?: boolean } | undefined;
      if (!d || d.url !== here()) return;
      if (d.type === "page-state" && d.fromCache) {
        fromCache = true;
        setSavedAt(d.savedAt ?? null);
        setUnreachable(!!d.unreachable);
        if (d.updated) return refresh();
        // A copy saved under another theme or look than this device uses now: start the saved pages over.
        if (staleLook()) {
          sw.controller?.postMessage({ type: "clear-pages" });
          refresh();
        }
      } else if (d.type === "page-updated" && fromCache) {
        setUnreachable(false);
        refresh();
      } else if (d.type === "page-unreachable" && fromCache) {
        setUnreachable(true);
      }
    }
    sw.addEventListener("message", onMessage);
    sw.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => {});
    sw.ready.then((reg) => reg.active?.postMessage({ type: "hello", url: here() })).catch(() => {});

    // Once things are quiet, save the main pages and the decks for offline (the worker skips fresh ones).
    const warm = window.setTimeout(() => {
      if (navigator.onLine) sw.ready.then((reg) => reg.active?.postMessage({ type: "warm" })).catch(() => {});
    }, 5000);
    return () => {
      sw.removeEventListener("message", onMessage);
      window.clearTimeout(warm);
    };
  }, [router]);

  return (
    <>
      {refreshing && <div className="shell-progress" aria-hidden="true" />}
      {(offline || unreachable) && (
        <p role="status" className="mb-4 rounded-xl border border-line bg-panel px-4 py-3 text-sm text-muted">
          <span className="font-semibold text-foreground">{offline ? "You’re offline." : "Can’t reach MTG Deck Tutor right now."}</span>{" "}
          {savedAt ? `This is the copy saved on this device ${when(savedAt)}. ` : "Pages you’ve opened before still open. "}
          {waiting > 0
            ? `${waiting === 1 ? "1 deck change is" : `${waiting} deck changes are`} saved on this device, waiting to send.`
            : offline
              ? "Changes to a deck’s cards are kept on this device and sent when you’re back online; anything else needs a connection."
              : "Changes to a deck’s cards are kept on this device and sent when it answers; anything else may not save."}
        </p>
      )}
    </>
  );
}

/** The page was drawn with a theme or look this device no longer uses (cookies set in Settings). */
function staleLook(): boolean {
  const cookie = (name: string) => document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`))?.[1];
  const theme = cookie("theme");
  const want = theme === "kitchen" || theme === "auto" ? theme : "commandery";
  return document.documentElement.dataset.theme !== want || cookie("look") === "old";
}

/** "at 3:12 pm", or "on Sat at 3:12 pm" for an earlier day. */
function when(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "earlier";
  const time = d.toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" });
  return d.toDateString() === new Date().toDateString() ? `at ${time}` : `on ${d.toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" })} at ${time}`;
}
