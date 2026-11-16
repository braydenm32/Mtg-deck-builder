import Link from "next/link";
import type { StatBar } from "@/lib/collection/collection-stats";

const fmt = (n: number) => n.toLocaleString("en-AU");

/** A titled list of bars: label, a bar in the accent colour, and the count. Each row opens those cards. */
export function StatBars({ title, bars, note }: { title: string; bars: StatBar[]; note?: string }) {
  const max = Math.max(1, ...bars.map((b) => b.count));
  return (
    <section className="space-y-2 rounded-2xl border border-line bg-panel p-4">
      <h3 className="text-base font-semibold">{title}</h3>
      <ul className="space-y-0.5">
        {bars.map((b) => (
          <li key={b.key}>
            <Link href={b.href} className="grid min-h-9 grid-cols-[minmax(0,9.5rem)_minmax(0,1fr)_2.5rem] items-center gap-3 rounded-lg text-sm hover:bg-(--panel-2)">
              <span className="truncate">{b.label}</span>
              <span className="h-2 rounded-full bg-(--panel-2)">
                <span className="block h-2 rounded-full bg-accent" style={{ width: `${(b.count / max) * 100}%` }} />
              </span>
              <span className="text-right text-muted tabular-nums">{fmt(b.count)}</span>
            </Link>
          </li>
        ))}
      </ul>
      {note && <p className="text-[13px] text-muted">{note}</p>}
    </section>
  );
}

/** Mana curve as columns, 0 to 7+, each a link to those cards. */
export function CurveBars({ bars, average }: { bars: StatBar[]; average: number | null }) {
  const max = Math.max(1, ...bars.map((b) => b.count));
  return (
    <section className="space-y-2 rounded-2xl border border-line bg-panel p-4">
      <h3 className="text-base font-semibold">Mana values</h3>
      <ul className="grid h-36 grid-cols-8 items-end gap-1.5">
        {bars.map((b) => (
          <li key={b.key} className="h-full">
            <Link href={b.href} className="flex h-full flex-col items-center gap-1 rounded-lg pt-1 hover:bg-(--panel-2)" aria-label={`Mana value ${b.label}: ${fmt(b.count)} cards`}>
              {/* The count rides on top of its column; the top 1rem is kept for the tallest one's count. */}
              <span className="relative w-full flex-1">
                <span
                  className="absolute bottom-0 left-1/2 w-full max-w-8 -translate-x-1/2 rounded-t-[4px] bg-accent"
                  style={{ height: `calc((100% - 1rem) * ${b.count / max})`, minHeight: b.count ? 2 : 0 }}
                />
                <span className="absolute left-0 right-0 text-center text-[11px] text-muted tabular-nums" style={{ bottom: `calc((100% - 1rem) * ${b.count / max} + 2px)` }}>
                  {fmt(b.count)}
                </span>
              </span>
              <span className="text-xs font-medium tabular-nums">{b.label}</span>
            </Link>
          </li>
        ))}
      </ul>
      <p className="text-[13px] text-muted">Unique cards that aren&rsquo;t lands{average != null ? `, averaging ${average}` : ""}.</p>
    </section>
  );
}
