"use client";

import { useState } from "react";
import type { CardRulings as Data } from "@/lib/cards/rulings";
import { formatDate } from "@/lib/format";

/**
 * The card's official rulings, for the "does this work with…" questions at the table. Loaded when
 * opened, from Scryfall (kept for a month after the first look).
 */
export function CardRulings({ oracleId }: { oracleId: string }) {
  const [data, setData] = useState<Data>();
  const [failed, setFailed] = useState(false);

  async function load() {
    if (data?.ok) return;
    setFailed(false);
    const res = await fetch(`/api/cards/${oracleId}/rulings`).catch(() => undefined);
    const body = res?.ok ? ((await res.json()) as Data) : undefined;
    if (body?.ok) setData(body);
    else setFailed(true);
  }

  return (
    <details className="group rounded-2xl border border-line bg-panel" onToggle={(e) => (e.currentTarget as HTMLDetailsElement).open && void load()}>
      <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-2 px-4">
        <h2 className="text-base font-semibold">Rulings{data?.ok ? ` (${data.rulings.length})` : ""}</h2>
        <span className="text-sm text-accent group-open:hidden">Show</span>
      </summary>
      <div className="px-4 pb-4 text-sm">
        {failed ? (
          <p className="text-muted">
            Rulings need a connection.{" "}
            <button type="button" className="font-medium text-accent" onClick={() => void load()}>
              Try again
            </button>
          </p>
        ) : !data ? (
          <p className="text-muted">Finding rulings…</p>
        ) : data.rulings.length === 0 ? (
          <p className="text-muted">No rulings for this card.</p>
        ) : (
          <ul className="space-y-3">
            {data.rulings.map((r, i) => (
              <li key={i} className="space-y-0.5">
                <p className="leading-relaxed">{r.text}</p>
                <p className="text-[13px] text-muted">
                  {formatDate(r.date)} · {r.source}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </details>
  );
}
