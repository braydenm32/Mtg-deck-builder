import type { CurveBucket } from "@/lib/deck/stats";

/**
 * Mana curve: one series, so one colour (the accent) and no legend; the heading names it.
 * Thin bars anchored to the baseline with rounded tops, a 2px gap, hover titles, and a table view.
 */
export function ManaCurve({
  curve,
  showCounts = false,
  barClassName = "bg-accent",
}: {
  curve: CurveBucket[];
  /** Label every bar with its count, not only the tallest. */
  showCounts?: boolean;
  /** The bars' fill. The new look passes a quiet colour, keeping its gradient for the main button. */
  barClassName?: string;
}) {
  const max = Math.max(1, ...curve.map((b) => b.count));
  const peak = curve.reduce((m, b) => (b.count > m.count ? b : m), curve[0]);
  const label = (mv: number) => (mv >= 7 ? "7+" : String(mv));
  return (
    <figure className="space-y-2">
      <div className="flex h-28 items-end gap-0.5 border-b border-line" role="img" aria-label={`Mana curve, most cards at mana value ${label(peak.manaValue)}`}>
        {curve.map((b) => (
          <div key={b.manaValue} className="group relative flex h-full flex-1 items-end justify-center" title={`Mana value ${label(b.manaValue)}: ${b.count} cards (${b.permanents} permanents, ${b.spells} spells)`}>
            <div className={`w-3/5 max-w-6 rounded-t ${barClassName} group-hover:opacity-80`} style={{ height: `${(b.count / max) * 100}%`, minHeight: b.count ? 2 : 0 }} />
            {(showCounts || b === peak) && b.count > 0 && <span className="absolute text-xs text-muted" style={{ bottom: `calc(${(b.count / max) * 100}% + 2px)` }}>{b.count}</span>}
          </div>
        ))}
      </div>
      <div className="flex gap-0.5 text-center text-xs text-muted" aria-hidden>
        {curve.map((b) => (
          <span key={b.manaValue} className="flex-1">
            {label(b.manaValue)}
          </span>
        ))}
      </div>
      <details className="text-xs">
        <summary className="inline-flex min-h-11 cursor-pointer items-center text-muted">Show as a table</summary>
        <table className="w-full text-left">
          <thead>
            <tr className="text-muted">
              <th className="font-normal">Mana value</th>
              <th className="font-normal">Cards</th>
              <th className="font-normal">Permanents</th>
              <th className="font-normal">Spells</th>
            </tr>
          </thead>
          <tbody>
            {curve.map((b) => (
              <tr key={b.manaValue}>
                <td>{label(b.manaValue)}</td>
                <td>{b.count}</td>
                <td>{b.permanents}</td>
                <td>{b.spells}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
