import Image from "next/image";
import Link from "next/link";
import { getDb } from "@/db/client";
import { money } from "@/components/ui";
import { listActivity, soldTotals, type ActivityRow, type EventKind } from "@/lib/collection/activity";
import { formatDate, formatTime } from "@/lib/format";
import { getPriceView } from "@/lib/settings";
import type { PriceView } from "@/lib/money";

export const dynamic = "force-dynamic";

const KINDS: { kind?: EventKind; label: string }[] = [
  { label: "All" },
  { kind: "add", label: "Added" },
  { kind: "import", label: "Imports" },
  { kind: "remove", label: "Removed" },
  { kind: "count", label: "Counts" },
  { kind: "move", label: "Moves" },
  { kind: "sold", label: "Sold" },
];

const isKind = (k: string | undefined): k is EventKind => KINDS.some((x) => x.kind === k);

const n = (x: number) => Math.abs(x).toLocaleString("en-AU");
const copies = (x: number) => `${n(x)} ${Math.abs(x) === 1 ? "copy" : "copies"}`;

/** One line saying what happened. */
function what(r: ActivityRow, pv: PriceView): string {
  switch (r.kind) {
    case "import":
      return `Imported ${copies(r.quantity)}${r.detail ? ` from ${r.detail}` : ""}`;
    case "add":
      return `Added ${n(r.quantity)}${r.detail ? ` · ${r.detail}` : ""}`;
    case "remove":
      return `Removed ${n(r.quantity)}${r.detail ? ` from ${r.detail}` : ""}`;
    case "count":
      return `${r.quantity > 0 ? "+" : "−"}${n(r.quantity)} ${Math.abs(r.quantity) === 1 ? "copy" : "copies"}${r.detail ? ` · ${r.detail}` : ""}`;
    case "move":
      return `Moved ${n(r.quantity)} · ${r.detail}`;
    case "sold": {
      const each = r.priceUsd == null ? null : money(r.priceUsd, pv);
      return `Sold ${n(r.quantity)}${each ? ` at ${each} each` : ""}${r.detail ? ` · ${r.detail}` : ""}`;
    }
  }
}

/**
 * What's changed in the collection, newest first: cards added, imports, copies removed or moved,
 * and cards you sold (with what they fetched). ?kind= shows one kind.
 */
export default async function ActivityPage({ searchParams }: { searchParams: Promise<{ kind?: string }> }) {
  const k = (await searchParams).kind;
  const kind = isKind(k) ? k : undefined;
  const db = await getDb();
  const [rows, sold, pv] = await Promise.all([listActivity(db, { kind, limit: 300 }), soldTotals(db), getPriceView()]);

  const days: { day: string; rows: ActivityRow[] }[] = [];
  for (const r of rows) {
    const day = formatDate(r.at);
    if (days.at(-1)?.day !== day) days.push({ day, rows: [] });
    days.at(-1)!.rows.push(r);
  }
  const chip = (on: boolean) =>
    `inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm ${on ? "border-accent bg-panel font-medium" : "border-line hover:bg-background"}`;

  return (
    <div className="max-w-2xl space-y-3">
      <h1 className="old-look-only text-2xl font-semibold">Activity</h1>
      <nav aria-label="Show" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
        {KINDS.map((x) => (
          <Link
            key={x.label}
            href={x.kind ? `/collection/activity?kind=${x.kind}` : "/collection/activity"}
            className={chip(kind === x.kind)}
            aria-current={kind === x.kind ? "page" : undefined}
          >
            {x.label}
          </Link>
        ))}
      </nav>

      {sold.copies > 0 && (kind === undefined || kind === "sold") && (
        <p className="px-1 text-sm text-muted">
          You&rsquo;ve sold {copies(sold.copies)}
          {!pv.hide && sold.usd > 0 && (
            <>
              {" "}
              for <span className="font-semibold text-foreground tabular-nums">{money(sold.usd, pv)}</span>
            </>
          )}
          .
        </p>
      )}

      {days.length === 0 ? (
        <section className="space-y-2 rounded-2xl border border-line bg-panel p-6 text-center">
          <h2 className="text-lg font-semibold">Nothing yet</h2>
          <p className="text-sm text-muted">
            {kind ? "Nothing of this kind has happened yet." : "As you add, import, move, remove or sell cards, each change is noted here."}
          </p>
        </section>
      ) : (
        days.map((d) => (
          <section key={d.day} className="space-y-1" aria-label={d.day}>
            <h2 className="px-1 text-sm font-semibold">{d.day}</h2>
            <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-panel">
              {d.rows.map((r) => {
                const body = (
                  <>
                    <span className="relative h-[42px] w-[30px] shrink-0 overflow-hidden rounded-[3px] bg-skeleton">
                      {r.imageSmall && <Image src={r.imageSmall} alt="" fill sizes="30px" className="object-cover" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{r.name ?? (r.kind === "import" ? "Import" : "A card")}</span>
                      <span className="block text-[13px] text-muted">{what(r, pv)}</span>
                    </span>
                    <span className="shrink-0 text-xs text-muted tabular-nums">{formatTime(r.at)}</span>
                  </>
                );
                return (
                  <li key={r.id}>
                    {r.oracleId ? (
                      <Link href={`/collection/${r.oracleId}`} className="flex min-h-14 items-center gap-3 px-3 py-2 hover:bg-(--panel-2)">
                        {body}
                      </Link>
                    ) : (
                      <div className="flex min-h-14 items-center gap-3 px-3 py-2">{body}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}
      {rows.length >= 300 && <p className="px-1 text-sm text-muted">Showing the latest 300.</p>}
    </div>
  );
}
