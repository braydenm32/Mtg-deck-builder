import Link from "next/link";
import { getDb } from "@/db/client";
import { setProgress } from "@/lib/collection/sets";

export const dynamic = "force-dynamic";

const chip = (on: boolean) =>
  `inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm ${on ? "border-accent bg-panel font-medium" : "border-line hover:bg-background"}`;

/** Set completion: every set you own a card from, how much of it you have, closest to complete first. */
export default async function SetsPage({ searchParams }: { searchParams: Promise<{ all?: string }> }) {
  const all = (await searchParams).all === "1";
  const sets = await setProgress(await getDb(), { all });
  const done = sets.filter((s) => s.owned >= s.total).length;
  return (
    <div className="max-w-2xl space-y-3">
      <h1 className="old-look-only text-2xl font-semibold">Set completion</h1>
      <nav aria-label="Which sets" className="flex gap-2">
        <Link href="/collection/sets" className={chip(!all)} aria-current={!all ? "page" : undefined}>
          Sets
        </Link>
        <Link href="/collection/sets?all=1" className={chip(all)} aria-current={all ? "page" : undefined}>
          With tokens and art cards
        </Link>
      </nav>
      {sets.length === 0 ? (
        <p className="px-1 text-sm text-muted">Add cards to see how much of each set you have.</p>
      ) : (
        <>
          <p className="px-1 text-sm text-muted">
            Cards from {sets.length.toLocaleString("en-AU")} {sets.length === 1 ? "set" : "sets"}
            {done ? `, ${done} complete` : ""}. A card counts once whatever its finish; proxies don&rsquo;t count.
          </p>
          <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-panel">
            {sets.map((s) => (
              <li key={s.code}>
                <Link href={`/collection/sets/${s.code}`} className="block space-y-1.5 px-4 py-3 hover:bg-(--panel-2)">
                  <span className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0 truncate font-medium">{s.name}</span>
                    <span className="shrink-0 text-sm text-muted tabular-nums">
                      {s.owned} of {s.total}
                    </span>
                  </span>
                  <span className="block h-2 rounded-full bg-(--panel-2)">
                    <span className="block h-2 rounded-full bg-accent" style={{ width: `${Math.max(1, Math.round(s.share * 100))}%` }} />
                  </span>
                  <span className="block text-xs text-muted">
                    {s.code.toUpperCase()}
                    {s.releasedAt ? ` · ${s.releasedAt.slice(0, 4)}` : ""} · {Math.round(s.share * 100)}%
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
