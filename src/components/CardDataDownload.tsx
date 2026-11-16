"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui";

type State = { lastSync?: string; runningSince?: string; error?: string };

/**
 * Downloads Scryfall's card data from inside the app (POST /api/cards/sync), then reloads the page
 * once it's in. With `auto`, the first visit starts the download by itself (first run), so nobody
 * needs a command line.
 */
export function CardDataDownload({ initial, auto = false, label = "Download card data" }: { initial: State; auto?: boolean; label?: string }) {
  const router = useRouter();
  const [state, setState] = useState(initial);
  const [busy, setBusy] = useState(!!initial.runningSince);
  const startedFrom = useRef(initial.lastSync);
  const autoStarted = useRef(false);
  const startedAt = useRef(0);

  const start = useCallback(async () => {
    setBusy(true);
    startedAt.current = Date.now();
    setState((s) => ({ ...s, error: undefined }));
    const res = await fetch("/api/cards/sync", { method: "POST" }).catch(() => undefined);
    if (!res || (!res.ok && res.status !== 409)) {
      setBusy(false);
      setState((s) => ({ ...s, error: "Couldn’t reach the app. Check your connection and try again." }));
    }
  }, []);

  useEffect(() => {
    if (auto && !autoStarted.current && !initial.runningSince && !initial.lastSync) {
      autoStarted.current = true;
      void start();
    }
  }, [auto, initial.runningSince, initial.lastSync, start]);

  // While downloading, check every few seconds; reload the page when new data has landed.
  useEffect(() => {
    if (!busy) return;
    const t = setInterval(async () => {
      const next: State | undefined = await fetch("/api/cards/sync")
        .then((r) => (r.ok ? r.json() : undefined))
        .catch(() => undefined);
      if (!next || next.runningSince) return;
      // The server takes the download lock just after replying; don't mistake that gap for "done".
      if (next.lastSync === startedFrom.current && !next.error && Date.now() - startedAt.current < 20_000) return;
      setBusy(false);
      setState(next);
      if (next.lastSync && next.lastSync !== startedFrom.current) {
        startedFrom.current = next.lastSync;
        router.refresh();
      }
    }, 4000);
    return () => clearInterval(t);
  }, [busy, router]);

  if (busy) {
    return (
      <span role="status" className="inline-flex items-center gap-2 text-sm text-muted">
        <span aria-hidden className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-line border-t-accent" />
        Downloading card data from Scryfall. This takes a minute or two; the page updates by itself.
      </span>
    );
  }
  return (
    <span className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <Button type="button" onClick={start}>
        {label}
      </Button>
      {state.error && <span className="text-sm text-danger">The last download failed: {state.error}</span>}
    </span>
  );
}
