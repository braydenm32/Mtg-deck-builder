import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/db/client";
import { canUndo, getBatch, sourceLabel } from "@/lib/collection/import";
import { formatDateTime } from "@/lib/format";
import { currentLook } from "@/lib/look";
import { ImportOutcome } from "@/components/add/ImportOutcome";
import { cap, cardsFrom, importModeLabel, plural } from "@/components/add/text";
import { TopBar } from "@/components/shell/TopBar";
import { UndoImportButton } from "@/components/UndoImportButton";
import { Badge } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function ImportResult({ params }: { params: Promise<{ id: string }> }) {
  const id = Number.parseInt((await params).id, 10);
  const db = await getDb();
  const result = Number.isFinite(id) ? await getBatch(db, id) : undefined;
  if (!result) notFound();
  const [undoable, look] = await Promise.all([canUndo(db, id), currentLook()]);
  const { batch, misses } = result;
  const label = sourceLabel(batch.source);
  const title = batch.filename ?? label;
  const when = formatDateTime(batch.createdAt);
  const undone = batch.undoneAt ? formatDateTime(batch.undoneAt) : null;

  return (
    <div className="space-y-6">
      {/* New look: the file's name is the top bar's title, and Back goes to Import a file. */}
      {look === "new" && <TopBar inPage title={title} />}
      <div className="old-look-only">
        <Link href="/import" className="inline-flex min-h-11 items-center text-sm text-muted hover:text-foreground">
          ← Import
        </Link>
        <h1 className="mt-1 text-2xl font-semibold break-words">{title}</h1>
      </div>

      {/* Summary strip: how it matched, what it did, what needs you, where it came from, and when. */}
      <section aria-label="Summary" className="max-w-3xl space-y-4 rounded-2xl border border-line bg-panel p-4 sm:p-5">
        <p className="text-lg">
          <span className="grad-text font-[family-name:var(--font-sora)] text-3xl font-bold tabular-nums">
            {batch.matchedCount.toLocaleString("en-AU")} of {batch.rowCount.toLocaleString("en-AU")}
          </span>{" "}
          <span className="text-muted">rows matched</span>
        </p>
        <ul className="flex flex-wrap gap-2" aria-label="Status">
          {undone && (
            <li>
              <Badge tone="warn" className="px-2 py-1">
                Undone
              </Badge>
            </li>
          )}
          <li>
            <Badge className="px-2 py-1">{importModeLabel(batch.mode, label)}</Badge>
          </li>
          {!undone && (
            <li>
              {batch.unmatchedCount > 0 ? (
                <Badge tone="warn" className="px-2 py-1">
                  {batch.unmatchedCount} need{batch.unmatchedCount === 1 ? "s" : ""} you
                </Badge>
              ) : (
                <Badge tone="ok" className="px-2 py-1">
                  Nothing needs you
                </Badge>
              )}
            </li>
          )}
        </ul>
        {!undone && <ImportOutcome batchId={batch.id} />}
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 text-sm">
          <dt className="text-muted">From</dt>
          <dd className="min-w-0 break-words">
            {batch.filename ? (
              <>
                {batch.filename} <span className="text-muted">· {label}</span>
              </>
            ) : (
              `A pasted ${label.toLowerCase()}`
            )}
          </dd>
          <dt className="text-muted">Imported</dt>
          <dd>{when}</dd>
          {undone && (
            <>
              <dt className="text-muted">Undone</dt>
              <dd>
                {undone}. {cap(cardsFrom(label))} are back as they were before it.
              </dd>
            </>
          )}
        </dl>
        <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
          {undone ? (
            <Link href="/import" className="inline-flex min-h-12 items-center rounded-md bg-accent px-5 text-base font-medium text-accent-fg">
              Import a file
            </Link>
          ) : (
            <Link href="/collection?sort=added" className="inline-flex min-h-12 items-center rounded-md bg-accent px-5 text-base font-medium text-accent-fg">
              See your collection
            </Link>
          )}
          {undoable && <UndoImportButton batchId={batch.id} label={label} when={when} />}
        </div>
        {!undoable && !undone && (
          <p className="text-xs text-muted">
            {batch.snapshot
              ? `Only the latest import from ${label} can be undone, and a newer one came after this.`
              : "This import can’t be undone: it was made before Undo kept a copy of your cards."}
          </p>
        )}
      </section>

      {/* Rows that need you come first, each with a one-tap way to add it by hand. */}
      {misses.length > 0 && (
        <section aria-labelledby="needs-you" className="max-w-3xl space-y-3">
          <div className="space-y-1">
            <h2 id="needs-you" className="text-lg font-semibold">
              {undone ? "Weren’t matched" : "Needs you"}
            </h2>
            <p className="text-sm text-muted">
              {undone ? "These rows weren’t added." : "These rows weren’t added. Find each card to add it with the printing you have."}
            </p>
          </div>
          <ul className="space-y-2">
            {misses.map((m) => (
              <li key={m.id} className="flex flex-col gap-3 rounded-xl border border-line bg-panel p-4 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="font-medium break-words">{m.name ?? "No card name"}</p>
                  <p className="text-sm break-words">{m.reason}</p>
                  <p className="text-xs text-muted">
                    {[
                      plural(m.quantity, "copy", "copies"),
                      m.setCode && `${m.setCode.length <= 6 ? m.setCode.toUpperCase() : m.setCode}${m.collectorNumber ? ` #${m.collectorNumber}` : ""}`,
                      `row ${m.rowNumber} of the file`,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
                <Link
                  href={m.name ? `/collection/add?q=${encodeURIComponent(m.name)}` : "/collection/add"}
                  className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-md border border-line bg-background px-4 text-sm font-medium hover:border-accent"
                >
                  {m.name ? "Find and add" : "Add by hand"}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
