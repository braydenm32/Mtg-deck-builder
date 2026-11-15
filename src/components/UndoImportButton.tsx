"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Sheet } from "./add/Sheet";
import { cap, cardsFrom } from "./add/text";
import { Button } from "./ui";

/**
 * Undo an import, with a review step: a quiet button opens a sheet that says exactly what will
 * happen, and nothing changes until it's confirmed there.
 */
export function UndoImportButton({ batchId, label, when }: { batchId: number; label: string; when?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  async function undo() {
    setBusy(true);
    setError(undefined);
    try {
      const res = await fetch(`/api/import/${batchId}/undo`, { method: "POST" });
      if (!res.ok) {
        setError(`Not undone: ${(await res.json().catch(() => null))?.error ?? `error ${res.status}`}`);
        return;
      }
      setOpen(false);
      // The page comes back marked "Undone", with the time.
      router.refresh();
    } catch {
      setError("Not undone: couldn't reach the app. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-medium text-muted hover:bg-background hover:text-foreground"
      >
        Undo this import…
      </button>
      <Sheet open={open} onClose={() => !busy && setOpen(false)} title="Undo this import?">
        <div className="space-y-4 text-sm">
          <p>
            {cap(cardsFrom(label))} go back to exactly how they were{when ? ` before ${when}` : " before this import"}.
          </p>
          <p className="text-muted">Cards you scanned, typed in or imported from other apps aren&apos;t touched. You can import the file again afterwards.</p>
          {error && (
            <p className="rounded-lg bg-danger-bg p-3 text-danger" role="alert">
              {error}
            </p>
          )}
          <div className="grid gap-2 sm:grid-cols-2">
            <Button variant="secondary" className="min-h-12 text-base" onClick={() => setOpen(false)} disabled={busy} data-autofocus>
              Keep it
            </Button>
            <button
              type="button"
              onClick={undo}
              disabled={busy}
              className="inline-flex min-h-12 items-center justify-center rounded-md border border-danger/50 bg-danger-bg px-4 text-base font-medium text-danger hover:border-danger disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? "Undoing…" : "Undo import"}
            </button>
          </div>
        </div>
      </Sheet>
    </>
  );
}
