import type { ColourCurve as Row } from "@/lib/deck/stats";
import { ColorPips } from "@/components/ui";

const NAME: Record<Row["key"], string> = { W: "White", U: "Blue", B: "Black", R: "Red", G: "Green", M: "Multicolour", C: "Colourless" };
const label = (mv: number) => (mv >= 7 ? "7+" : String(mv));

/**
 * The mana curve split by colour: a small curve per colour (each card counted under its own
 * colours, multicoloured cards together), on one scale so the rows compare. Shows where a colour's
 * cards sit, such as all the green being cheap ramp.
 */
export function ColourCurve({ rows }: { rows?: Row[] }) {
  if (!rows || rows.length < 2) return null;
  const max = Math.max(1, ...rows.flatMap((r) => r.counts));
  return (
    <details className="text-sm">
      <summary className="inline-flex min-h-11 cursor-pointer items-center text-muted">Split by colour</summary>
      <ul className="space-y-2 pt-1">
        {rows.map((r) => (
          <li key={r.key} className="grid grid-cols-[6.5rem_minmax(0,1fr)_1.75rem] items-end gap-2">
            <span className="flex items-center gap-1.5 pb-0.5 text-xs">
              {r.key === "M" || r.key === "C" ? <span className="h-3 w-3 rounded-full border border-line bg-(--panel-2)" aria-hidden /> : <ColorPips identity={r.key} />}
              <span className="truncate">{NAME[r.key]}</span>
            </span>
            <span className="flex h-8 items-end gap-0.5 border-b border-line" role="img" aria-label={`${NAME[r.key]}: ${r.counts.map((n, i) => (n ? `${n} at ${label(i)}` : "")).filter(Boolean).join(", ")}`}>
              {r.counts.map((n, i) => (
                <span key={i} className="flex h-full flex-1 items-end justify-center" title={`${NAME[r.key]}, mana value ${label(i)}: ${n}`}>
                  <span className="w-3/5 max-w-6 rounded-t-[2px] bg-[var(--accent-text)]/70" style={{ height: `${(n / max) * 100}%`, minHeight: n ? 2 : 0 }} />
                </span>
              ))}
            </span>
            <span className="pb-0.5 text-right text-xs text-muted tabular-nums">{r.total}</span>
          </li>
        ))}
        <li className="grid grid-cols-[6.5rem_minmax(0,1fr)_1.75rem] gap-2 text-center text-[11px] text-muted" aria-hidden>
          <span />
          <span className="flex gap-0.5">
            {Array.from({ length: 8 }, (_, i) => (
              <span key={i} className="flex-1">
                {label(i)}
              </span>
            ))}
          </span>
          <span />
        </li>
      </ul>
    </details>
  );
}
