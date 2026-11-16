"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Sheet } from "./Sheet";
import { plural } from "./text";
import { Toast, useToast } from "./Toast";

export type Miss = {
  id: number;
  rowNumber: number;
  name: string | null;
  setCode: string | null;
  collectorNumber: string | null;
  quantity: number;
  reason: string;
  resolution: string | null;
  resolvedAt: string | null;
};

type Resolution = "added" | "not-owned";

const DONE_LABEL: Record<string, string> = { added: "Added", "not-owned": "Not yours" };

/**
 * The rows an import couldn't match. Open rows come first, each with "Find and add" (Type a name,
 * which marks the row done once the card is saved) and "Mark done". Rows already dealt with fold
 * away under "Done", where each can be opened again. Saves go through
 * PATCH /api/import/:id/misses/:rowId.
 */
export function ImportMisses({ batchId, misses, undone }: { batchId: number; misses: Miss[]; undone: boolean }) {
  const router = useRouter();
  const { toast, show } = useToast();
  const [marking, setMarking] = useState<Miss>();
  const [busy, setBusy] = useState<number>();
  const open = misses.filter((m) => !m.resolvedAt);
  const done = misses.filter((m) => m.resolvedAt);

  async function resolve(m: Miss, resolution: Resolution | null) {
    setBusy(m.id);
    setMarking(undefined);
    const res = await fetch(`/api/import/${batchId}/misses/${m.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resolution }),
    }).catch(() => undefined);
    setBusy(undefined);
    const name = m.name ?? `Row ${m.rowNumber}`;
    if (!res?.ok) return show(`Couldn't save that for ${name}. Try again.`, "danger");
    show(resolution ? `Marked done: ${name}` : `Opened again: ${name}`);
    router.refresh();
  }

  const meta = (m: Miss) =>
    [
      plural(m.quantity, "copy", "copies"),
      m.setCode && `${m.setCode.length <= 6 ? m.setCode.toUpperCase() : m.setCode}${m.collectorNumber ? ` #${m.collectorNumber}` : ""}`,
      `row ${m.rowNumber} of the file`,
    ]
      .filter(Boolean)
      .join(" · ");

  const addHref = (m: Miss) => {
    const q = new URLSearchParams();
    if (m.name) q.set("q", m.name);
    q.set("fix", `${batchId}-${m.id}`);
    if (m.quantity > 1) q.set("qty", String(m.quantity));
    return `/collection/add?${q}`;
  };

  if (undone) {
    return (
      <section aria-labelledby="needs-you" className="max-w-3xl space-y-3">
        <div className="space-y-1">
          <h2 id="needs-you" className="text-lg font-semibold">
            Weren&rsquo;t matched
          </h2>
          <p className="text-sm text-muted">These rows weren&rsquo;t added.</p>
        </div>
        <ul className="space-y-2">
          {misses.map((m) => (
            <li key={m.id} className="space-y-1 rounded-xl border border-line bg-panel p-4">
              <p className="font-medium break-words">{m.name ?? "No card name"}</p>
              <p className="text-sm break-words">{m.reason}</p>
              <p className="text-xs text-muted">{meta(m)}</p>
            </li>
          ))}
        </ul>
      </section>
    );
  }

  return (
    <section aria-labelledby="needs-you" className="max-w-3xl space-y-3">
      <div className="space-y-1">
        <h2 id="needs-you" className="text-lg font-semibold">
          {open.length > 0 ? "Needs you" : "Rows that weren’t matched"}
        </h2>
        <p className="text-sm text-muted">
          {open.length > 0
            ? "These rows weren’t added. Find each card to add the printing you have, or mark the row done."
            : "Every row is dealt with. Nothing here needs you."}
        </p>
      </div>

      {open.length > 0 && (
        <ul className="space-y-2">
          {open.map((m) => (
            <li key={m.id} className="flex flex-col gap-3 rounded-xl border border-line bg-panel p-4 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1 space-y-1">
                <p className="font-medium break-words">{m.name ?? "No card name"}</p>
                <p className="text-sm break-words">{m.reason}</p>
                <p className="text-xs text-muted">{meta(m)}</p>
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                <Link
                  href={addHref(m)}
                  className="inline-flex min-h-11 flex-1 items-center justify-center rounded-md border border-line bg-background px-4 text-sm font-medium hover:border-accent sm:flex-none"
                >
                  {m.name ? "Find and add" : "Add by hand"}
                </Link>
                <button
                  type="button"
                  aria-haspopup="dialog"
                  disabled={busy === m.id}
                  onClick={() => setMarking(m)}
                  className="inline-flex min-h-11 flex-1 items-center justify-center rounded-md px-4 text-sm font-medium text-muted hover:text-foreground disabled:opacity-50 sm:flex-none"
                >
                  Mark done
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {done.length > 0 && (
        <details className="group rounded-xl border border-line bg-panel" open={open.length === 0}>
          <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 text-sm font-medium [&::-webkit-details-marker]:hidden">
            <span>Done ({done.length})</span>
            <span aria-hidden className="text-muted">
              <span className="group-open:hidden">Show</span>
              <span className="hidden group-open:inline">Hide</span>
            </span>
          </summary>
          <ul className="divide-y divide-line border-t border-line">
            {done.map((m) => (
              <li key={m.id} className="flex items-center gap-3 px-4 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{m.name ?? "No card name"}</p>
                  <p className="text-xs text-muted">
                    {DONE_LABEL[m.resolution ?? ""] ?? "Done"} · {meta(m)}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={busy === m.id}
                  onClick={() => resolve(m, null)}
                  className="inline-flex min-h-11 shrink-0 items-center px-2 text-sm font-medium text-muted hover:text-foreground disabled:opacity-50"
                >
                  Open again
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}

      <Sheet open={!!marking} onClose={() => setMarking(undefined)} title={marking ? `Mark ${marking.name ?? `row ${marking.rowNumber}`} done` : ""}>
        {marking && (
          <div className="-mx-1 space-y-1">
            <button type="button" data-autofocus className="flex min-h-12 w-full flex-col justify-center rounded-xl px-3 py-2 text-left hover:bg-(--panel-2)" onClick={() => resolve(marking, "added")}>
              <span className="font-medium">I&rsquo;ve added it</span>
              <span className="text-[13px] text-muted">It&rsquo;s in your collection now, another way.</span>
            </button>
            <button type="button" className="flex min-h-12 w-full flex-col justify-center rounded-xl px-3 py-2 text-left hover:bg-(--panel-2)" onClick={() => resolve(marking, "not-owned")}>
              <span className="font-medium">I don&rsquo;t own it</span>
              <span className="text-[13px] text-muted">The row was a mistake, or the card is gone.</span>
            </button>
          </div>
        )}
      </Sheet>
      <Toast toast={toast} />
    </section>
  );
}
