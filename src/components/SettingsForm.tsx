"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Currency } from "@/lib/money";

type Settings = { hidePrices: boolean; currency: Currency };

/**
 * App settings. Each change saves straight away. `look="new"` is the new look's version: one
 * "Show prices" switch and the two currencies, in one quiet panel.
 */
export function SettingsForm({ initial, rate, look = "old" }: { initial: Settings; rate: { audPerUsd: number; date: string | null }; look?: "old" | "new" }) {
  const router = useRouter();
  const [s, setS] = useState(initial);
  const [status, setStatus] = useState<string>();

  async function save(patch: Partial<Settings>) {
    const prev = s;
    setS({ ...s, ...patch });
    setStatus(undefined);
    const res = await fetch("/api/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
    if (!res.ok) {
      setS(prev);
      setStatus("That didn’t save. Try again.");
      return;
    }
    setStatus("Saved.");
    router.refresh();
  }

  const currencies = [
    { value: "USD", label: "US dollars (US$)", help: "Scryfall’s prices, as they are." },
    {
      value: "AUD",
      label: "Australian dollars (A$)",
      help: `Converted from US dollars at A$${rate.audPerUsd.toFixed(4)} per US$1${rate.date ? ` (rate from ${rate.date})` : " (approximate built-in rate)"}.`,
    },
  ] as const;

  if (look === "new") {
    const rateText = `A$${rate.audPerUsd.toFixed(4)} per US$1, ${rate.date ? `the rate on ${rate.date}` : "an approximate built-in rate"}`;
    return (
      <div className="max-w-xl space-y-3">
        <div className="overflow-hidden rounded-2xl border border-line bg-panel">
          <label className="flex min-h-16 cursor-pointer items-center justify-between gap-4 p-4">
            <span className="min-w-0">
              <span className="block font-medium">Show prices</span>
              <span className="block text-[13px] text-muted">Card values, collection totals and the cost to finish a deck.</span>
            </span>
            <input
              type="checkbox"
              role="switch"
              checked={!s.hidePrices}
              onChange={(e) => save({ hidePrices: !e.target.checked })}
              className="relative h-7 w-12 shrink-0 cursor-pointer appearance-none rounded-full border border-line bg-(--panel-2) transition-colors before:absolute before:left-[3px] before:top-[3px] before:h-5 before:w-5 before:rounded-full before:bg-muted before:transition-transform checked:border-transparent checked:bg-accent checked:before:translate-x-5 checked:before:bg-white"
            />
          </label>

          <fieldset disabled={s.hidePrices} className="border-t border-line disabled:opacity-60">
            <legend className="sr-only">Currency</legend>
            <p className="px-4 pt-4 text-[13px] font-medium text-muted" aria-hidden>
              Currency
            </p>
            {currencies.map((o) => (
              <label key={o.value} className="flex min-h-14 cursor-pointer items-center gap-3 px-4 py-3">
                <input type="radio" name="currency" className="h-5 w-5 shrink-0 accent-(--accent)" checked={s.currency === o.value} onChange={() => save({ currency: o.value })} />
                <span className="min-w-0">
                  <span className="block">{o.label}</span>
                  <span className="block text-[13px] text-muted">{o.value === "USD" ? "Scryfall’s prices, as they are." : `Converted from US dollars at ${rateText}.`}</span>
                </span>
              </label>
            ))}
          </fieldset>
        </div>
        <p className="min-h-5 px-1 text-[13px] text-muted" role="status">
          {status ?? (s.hidePrices ? "Prices are off everywhere, so the currency isn’t used." : "")}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <h2 className="font-semibold">Prices</h2>
        <label className="flex min-h-11 items-center gap-3 text-sm">
          <input type="checkbox" className="h-5 w-5" checked={s.hidePrices} onChange={(e) => save({ hidePrices: e.target.checked })} />
          Hide prices everywhere
        </label>
        <p className="text-sm text-muted">
          Card values, collection totals and the cost to finish a deck are left out. The builder still uses prices behind the scenes, for example to
          suggest another copy of a cheap card.
        </p>
      </section>

      <fieldset className="space-y-2" disabled={s.hidePrices}>
        <legend className="mb-2 font-semibold">Currency</legend>
        {currencies.map((o) => (
          <label key={o.value} className={`flex min-h-11 cursor-pointer gap-3 rounded-md border p-3 text-sm ${s.currency === o.value ? "border-accent" : "border-line"}`}>
            <input type="radio" name="currency" className="mt-0.5 h-5 w-5" checked={s.currency === o.value} onChange={() => save({ currency: o.value })} />
            <span>
              <span className="font-medium">{o.label}</span>
              <span className="block text-muted">{o.help}</span>
            </span>
          </label>
        ))}
        {s.hidePrices && <p className="text-sm text-muted">Prices are hidden, so the currency isn’t used.</p>}
      </fieldset>

      <p className="min-h-5 text-sm text-muted" role="status">
        {status}
      </p>
    </div>
  );
}
