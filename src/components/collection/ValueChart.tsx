"use client";

import { useRef, useState } from "react";
import { formatMoney, type PriceView } from "@/lib/money";
import { formatDate } from "@/lib/format";

export type ValuePoint = { date: string; usd: number };

const W = 600;
const H = 160;
const PAD = { top: 12, right: 8, bottom: 22, left: 8 };

/**
 * The collection's value by day: one line in the accent colour, a crosshair and the day's total
 * under your finger or the pointer. No axis clutter: the first and last days are labelled.
 */
export function ValueChart({ points, prices }: { points: ValuePoint[]; prices: PriceView }) {
  const [hover, setHover] = useState<number>();
  const ref = useRef<SVGSVGElement>(null);
  if (points.length < 2) return null;

  const t = points.map((p) => Date.parse(p.date));
  const t0 = t[0];
  const t1 = t[t.length - 1];
  const vals = points.map((p) => p.usd);
  let lo = Math.min(...vals);
  let hi = Math.max(...vals);
  if (hi - lo < 1) {
    lo -= 1;
    hi += 1;
  }
  const x = (i: number) => PAD.left + ((t[i] - t0) / (t1 - t0 || 1)) * (W - PAD.left - PAD.right);
  const y = (v: number) => PAD.top + (1 - (v - lo) / (hi - lo)) * (H - PAD.top - PAD.bottom);
  const line = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.usd).toFixed(1)}`).join("");
  const area = `${line}L${x(points.length - 1).toFixed(1)},${H - PAD.bottom}L${x(0).toFixed(1)},${H - PAD.bottom}Z`;

  function onMove(e: React.PointerEvent<SVGSVGElement>) {
    const box = ref.current?.getBoundingClientRect();
    if (!box) return;
    const px = ((e.clientX - box.left) / box.width) * W;
    let best = 0;
    for (let i = 1; i < points.length; i++) if (Math.abs(x(i) - px) < Math.abs(x(best) - px)) best = i;
    setHover(best);
  }

  const h = hover != null ? points[hover] : undefined;
  const hx = hover != null ? x(hover) : 0;
  const first = points[0];
  const last = points[points.length - 1];

  return (
    <figure className="space-y-1">
      <div className="flex min-h-10 items-end justify-between gap-3 text-sm" aria-live="polite">
        {h ? (
          <>
            <span className="text-muted">{formatDate(h.date)}</span>
            <span className="font-semibold tabular-nums">{formatMoney(h.usd, prices)}</span>
          </>
        ) : (
          <span className="text-[13px] text-muted">Touch the line to see a day</span>
        )}
      </div>
      <div className="relative">
      <svg
        ref={ref}
        viewBox={`0 0 ${W} ${H}`}
        className="h-40 w-full touch-pan-y select-none"
        preserveAspectRatio="none"
        role="img"
        aria-label={`Collection value from ${formatMoney(first.usd, prices)} on ${formatDate(first.date)} to ${formatMoney(last.usd, prices)} on ${formatDate(last.date)}`}
        onPointerMove={onMove}
        onPointerDown={onMove}
        onPointerLeave={() => setHover(undefined)}
      >
        <line x1={PAD.left} x2={W - PAD.right} y1={H - PAD.bottom} y2={H - PAD.bottom} stroke="var(--line)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
        <path d={area} fill="var(--accent)" opacity={0.1} />
        <path d={line} fill="none" stroke="var(--accent)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        {h && (
          <>
            <line x1={hx} x2={hx} y1={PAD.top} y2={H - PAD.bottom} stroke="var(--muted)" strokeWidth={1} strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
          </>
        )}
      </svg>
      {/* The dot sits outside the stretched SVG so it stays round. */}
      {h && (
        <span
          aria-hidden
          className="pointer-events-none absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-panel bg-accent"
          style={{ left: `${(hx / W) * 100}%`, top: `${(y(h.usd) / H) * 100}%` }}
        />
      )}
      </div>
      <figcaption className="flex justify-between text-[13px] text-muted tabular-nums">
        <span>{formatDate(first.date)}</span>
        <span>{formatDate(last.date)}</span>
      </figcaption>
    </figure>
  );
}
