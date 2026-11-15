import Link from "next/link";
import { getDb } from "@/db/client";
import { recentBatches, sourceLabel } from "@/lib/collection/import";
import { ImportForm } from "@/components/ImportForm";

export const dynamic = "force-dynamic";

export default async function ImportPage() {
  const batches = await recentBatches(await getDb());
  return (
    <div className="grid gap-8 lg:grid-cols-[2fr_1fr]">
      <section className="space-y-4">
        <h1 className="text-2xl font-semibold">Import cards</h1>
        <ImportForm />
      </section>
      <aside className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Recent imports</h2>
        {batches.length === 0 && <p className="text-sm text-muted">None yet.</p>}
        <ul className="space-y-2 text-sm">
          {batches.map((b) => (
            <li key={b.id}>
              <Link href={`/import/${b.id}`} className="block rounded-md border border-line bg-panel p-3 hover:bg-background">
                <div className="font-medium">{b.filename ?? sourceLabel(b.source)}</div>
                <div className="text-xs text-muted">
                  {sourceLabel(b.source)} · {new Date(b.createdAt).toLocaleString("en-AU")} · {b.matchedCount} matched
                  {b.unmatchedCount > 0 && <span className="text-warn"> · {b.unmatchedCount} need review</span>}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}
