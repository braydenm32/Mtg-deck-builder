"use client";

import { useState } from "react";
import { chanceByTurn } from "@/lib/deck/probability";

export type OddsPreset = { label: string; count: number };

const field =
  "h-12 w-full rounded-xl border border-line bg-panel px-3 text-base text-foreground md:h-11 md:text-sm";
const clamp = (n: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, Number.isFinite(n) ? Math.round(n) : lo));

/**
 * "What are the odds?": the chance of drawing at least K of the N cards you care about by turn T, in a
 * multiplayer game (everyone draws on turn 1). Pick a role the deck counts, or type your own number.
 */
export function DrawOdds({
  library,
  presets,
}: {
  library: number;
  presets: OddsPreset[];
}) {
  const first = presets.find((p) => p.label === "Ramp") ?? presets[0];
  const [copies, setCopies] = useState(first?.count || 1);
  const [picked, setPicked] = useState<string | undefined>(first?.label);
  const [needed, setNeeded] = useState(1);
  const [turn, setTurn] = useState(3);
  const n = clamp(copies, 0, library);
  const k = clamp(needed, 1, 7);
  const t = clamp(turn, 1, 15);
  const p = chanceByTurn({ library, copies: n, turn: t, needed: k });
  const pct =
    p >= 0.995 && p < 1
      ? ">99%"
      : p > 0 && p < 0.005
        ? "<1%"
        : `${Math.round(p * 100)}%`;

  return (
    <section
      className="min-w-0 space-y-3 rounded-2xl border border-line bg-panel p-4"
      aria-labelledby="odds-h"
    >
      <div>
        <h2 id="odds-h" className="text-lg font-semibold">
          What are the odds?
        </h2>
        <p className="text-sm text-muted">
          The chance to have drawn the cards you need by a turn, from the
          opening seven plus a draw each turn.
        </p>
      </div>
      {presets.length > 0 && (
        <div
          className="flex flex-wrap gap-1.5"
          role="group"
          aria-label="Cards in the deck"
        >
          {presets.map((pr) => (
            <button
              key={pr.label}
              type="button"
              onClick={() => {
                setCopies(pr.count);
                setPicked(pr.label);
              }}
              aria-pressed={picked === pr.label}
              className={`inline-flex min-h-10 items-center rounded-full border px-3 text-sm ${picked === pr.label ? "border-accent text-foreground" : "border-line text-muted"}`}
            >
              {pr.label} <span className="ml-1 tabular-nums">{pr.count}</span>
            </button>
          ))}
        </div>
      )}
      <div className="grid grid-cols-3 gap-2">
        <label className="block space-y-1 text-sm text-muted">
          <span>Cards in deck</span>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            max={library}
            value={copies}
            onChange={(e) => {
              setCopies(Number(e.target.value));
              setPicked(undefined);
            }}
            className={field}
          />
        </label>
        <label className="block space-y-1 text-sm text-muted">
          <span>At least</span>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={7}
            value={needed}
            onChange={(e) => setNeeded(Number(e.target.value))}
            className={field}
          />
        </label>
        <label className="block space-y-1 text-sm text-muted">
          <span>By turn</span>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={15}
            value={turn}
            onChange={(e) => setTurn(Number(e.target.value))}
            className={field}
          />
        </label>
      </div>
      <p className="flex items-baseline gap-3" aria-live="polite">
        <span className="grad-text font-[family-name:var(--font-sora)] text-3xl font-bold tabular-nums">
          {pct}
        </span>
        <span className="text-sm text-muted">
          to draw at least {k} of {n} by turn {t}
        </span>
      </p>
    </section>
  );
}
