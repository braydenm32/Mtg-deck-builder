import Link from "next/link";
import { formatDateTime } from "@/lib/format";
import { getDb } from "@/db/client";
import { openMissCounts, recentBatches, sourceLabel } from "@/lib/collection/import";
import { ImportForm } from "@/components/ImportForm";
import { Badge } from "@/components/ui";

export const dynamic = "force-dynamic";

/*
 * In a route group so its loading skeleton covers only this page, not /import/[id] beside it.
 * The address is still /import.
 */
export default async function ImportPage() {
  const db = await getDb();
  const batches = await recentBatches(db);
  // Rows marked done on the review page don't need you any more.
  const open = await openMissCounts(db, batches.map((b) => b.id));
  return (
    <div className="space-y-4">
      {/* The new look's top bar already says "Add cards", with this page as the "Import a file" tab. */}
      <h1 className="old-look-only text-2xl font-semibold">Import cards</h1>
      <ImportForm
        aside={
          <aside aria-labelledby="recent-imports" className="min-w-0 space-y-2">
            <h2 id="recent-imports" className="text-sm font-semibold text-muted">
              Recent imports
            </h2>
            {batches.length === 0 ? (
              <p className="text-sm text-muted">None yet. Your imports will be listed here, each with its own review and Undo.</p>
            ) : (
              <ul className="divide-y divide-line rounded-xl border border-line bg-panel">
                {batches.map((b) => (
                  <li key={b.id}>
                    <Link href={`/import/${b.id}`} className="flex min-h-14 items-center gap-3 px-3 py-2.5 hover:bg-background">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{b.filename ?? sourceLabel(b.source)}</span>
                        <span className="block truncate text-xs text-muted">
                          {sourceLabel(b.source)} · {formatDateTime(b.createdAt)}
                        </span>
                      </span>
                      {b.undoneAt ? (
                        <Badge>Undone</Badge>
                      ) : (open.get(b.id) ?? 0) > 0 ? (
                        <Badge tone="warn">{open.get(b.id)} need you</Badge>
                      ) : (
                        <Badge tone="ok">
                          {b.matchedCount} of {b.rowCount} matched
                        </Badge>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </aside>
        }
      />
    </div>
  );
}
