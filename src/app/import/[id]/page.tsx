import Link from "next/link";
import { formatDateTime } from "@/lib/format";
import { notFound } from "next/navigation";
import { getDb } from "@/db/client";
import { canUndo, getBatch, sourceLabel } from "@/lib/collection/import";
import { UndoImportButton } from "@/components/UndoImportButton";
import { Panel } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function ImportResult({ params }: { params: Promise<{ id: string }> }) {
  const id = Number.parseInt((await params).id, 10);
  const db = await getDb();
  const result = Number.isFinite(id) ? await getBatch(db, id) : undefined;
  if (!result) notFound();
  const undoable = await canUndo(db, id);
  const { batch, misses } = result;
  return (
    <div className="space-y-6">
      <div>
        <Link href="/import" className="inline-flex min-h-11 items-center text-sm text-muted hover:text-foreground">
          ← Import
        </Link>
        <h1 className="mt-1 text-2xl font-semibold">{batch.filename ?? sourceLabel(batch.source)}</h1>
        <p className="text-sm text-muted">
          {sourceLabel(batch.source)} · {formatDateTime(batch.createdAt)}
          {(batch.mode === "update" || batch.mode === "replace-source") && " · updated the earlier import"}
          {batch.undoneAt && <span className="text-warn"> · undone {formatDateTime(batch.undoneAt)}</span>}
        </p>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Panel>
          <div className="text-xs uppercase text-muted">Rows</div>
          <div className="text-2xl font-semibold tabular-nums">{batch.rowCount}</div>
        </Panel>
        <Panel>
          <div className="text-xs uppercase text-muted">Matched</div>
          <div className="text-2xl font-semibold tabular-nums text-ok">{batch.matchedCount}</div>
        </Panel>
        <Panel>
          <div className="text-xs uppercase text-muted">Need review</div>
          <div className={`text-2xl font-semibold tabular-nums ${batch.unmatchedCount ? "text-warn" : ""}`}>{batch.unmatchedCount}</div>
        </Panel>
      </div>
      {misses.length > 0 ? (
        <section className="space-y-2">
          <h2 className="font-semibold">Cards we couldn&apos;t match</h2>
          <p className="text-sm text-muted">
            These weren&apos;t added. Check the spelling or set, then add them from{" "}
            <Link className="underline" href="/collection/add">
              Add cards
            </Link>
            .
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-muted">
                <tr>
                  <th className="py-1 pr-3">Row</th>
                  <th className="py-1 pr-3">Qty</th>
                  <th className="py-1 pr-3">Name</th>
                  <th className="py-1 pr-3">Set</th>
                  <th className="py-1 pr-3">#</th>
                  <th className="py-1">Why</th>
                </tr>
              </thead>
              <tbody>
                {misses.map((m) => (
                  <tr key={m.id} className="border-t border-line align-top">
                    <td className="py-1 pr-3 tabular-nums text-muted">{m.rowNumber}</td>
                    <td className="py-1 pr-3 tabular-nums">{m.quantity}</td>
                    <td className="py-1 pr-3">
                      {m.name ? (
                        <Link className="underline" href={`/collection/add?q=${encodeURIComponent(m.name)}`}>
                          {m.name}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="py-1 pr-3 uppercase">{m.setCode ?? "—"}</td>
                    <td className="py-1 pr-3">{m.collectorNumber ?? "—"}</td>
                    <td className="py-1 text-muted">{m.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : (
        <p className="rounded-md bg-ok-bg p-3 text-sm text-ok">Every card matched.</p>
      )}
      <div className="flex flex-wrap items-start gap-4">
        <Link href="/collection?sort=added" className="inline-flex min-h-11 items-center rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-fg">
          See your collection
        </Link>
        {undoable && <UndoImportButton batchId={batch.id} label={sourceLabel(batch.source)} />}
      </div>
    </div>
  );
}
