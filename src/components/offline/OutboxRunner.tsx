"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useTransition } from "react";
import { collectionQueued, flushCollectionOutbox } from "@/lib/offline/collection-outbox";
import { flushOutbox, queuedCount, settle, type OutboxSent } from "@/lib/offline/outbox";

/** How often to try again while edits are waiting and the app is open. */
const RETRY_MS = 20_000;
/** After the last send, how long until the deck's saved pages are fetched again for offline use. */
const RESAVE_MS = 10_000;

/**
 * Sends deck edits kept on this device (src/lib/offline/outbox.ts): when a page opens, when the
 * device comes back online or the app comes back to the front, and every 20 s while any wait. After
 * a send it redraws the page from the server, then lets the sent edits go from the page's overlay,
 * and has the service worker (public/sw.js) treat the deck's saved pages as out of date and save
 * them again once the edits settle.
 */
export function OutboxRunner() {
  const router = useRouter();
  const [redrawing, startRedraw] = useTransition();
  const upTo = useRef(0);

  useEffect(() => {
    // Deck edits first, then collection changes (src/lib/offline/collection-outbox.ts).
    const kick = () => void flushOutbox().then(() => flushCollectionOutbox());
    const onVisible = () => document.visibilityState === "visible" && kick();
    let resave: number | undefined;
    const onSent = (e: Event) => {
      const { gen, decks } = (e as CustomEvent<OutboxSent>).detail;
      upTo.current = gen;
      startRedraw(() => router.refresh());
      const sw = "serviceWorker" in navigator ? navigator.serviceWorker.controller : null;
      if (!sw) return;
      // The deck's saved pages, and the device's copy of the deck (src/lib/offline/deck-snapshot.ts).
      sw.postMessage({ type: "stale", paths: ["/", "/decks", ...decks.flatMap((id) => [`/decks/${id}`, `/decks/${id}/*`, `/api/decks/${id}/snapshot`])] });
      window.clearTimeout(resave);
      resave = window.setTimeout(() => navigator.serviceWorker.controller?.postMessage({ type: "warm" }), RESAVE_MS);
    };
    // Collection changes reached the server: redraw, and have the saved collection pages fetched again.
    const onCollectionSent = () => {
      startRedraw(() => router.refresh());
      navigator.serviceWorker?.controller?.postMessage({ type: "stale", paths: ["/", "/collection", "/collection/*"] });
    };
    kick();
    window.addEventListener("tutor-collection-sent", onCollectionSent);
    window.addEventListener("online", kick);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("tutor-outbox-sent", onSent);
    const retry = window.setInterval(() => document.visibilityState === "visible" && queuedCount() + collectionQueued() > 0 && kick(), RETRY_MS);
    return () => {
      window.removeEventListener("online", kick);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("tutor-outbox-sent", onSent);
      window.removeEventListener("tutor-collection-sent", onCollectionSent);
      window.clearInterval(retry);
      window.clearTimeout(resave);
    };
  }, [router]);

  useEffect(() => {
    if (redrawing || !upTo.current) return;
    settle(upTo.current);
    upTo.current = 0;
  }, [redrawing]);

  return null;
}
