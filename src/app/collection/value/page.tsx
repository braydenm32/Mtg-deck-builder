import Image from "next/image";
import Link from "next/link";
import { getDb } from "@/db/client";
import { PriceCheck } from "@/components/collection/PriceCheck";
import { ValueChart } from "@/components/collection/ValueChart";
import { money } from "@/components/ui";
import { collectionTotals } from "@/lib/collection/query";
import { formatDateTime } from "@/lib/format";
import { type Mover, priceState, readMovers, valueSeries } from "@/lib/prices/daily";
import { getPriceView } from "@/lib/settings";
import type { PriceView } from "@/lib/money";

export const dynamic = "force-dynamic";

const FINISH: Record<string, string> = { foil: "Foil", etched: "Etched" };

/** "+A$12.40" or "−A$3.10". */
function signed(usd: number, pv: PriceView) {
  const m = money(Math.abs(usd), pv);
  return m ? `${usd < 0 ? "−" : "+"}${m.replace("≈", "")}` : null;
}

/**
 * What the collection is worth, how that moved day by day, and the cards that moved it most this
 * week. Prices are checked once a day for the cards you own (src/lib/prices/daily.ts).
 */
export default async function ValuePage() {
  const db = await getDb();
  const [totals, series, movers, state, pv] = await Promise.all([collectionTotals(db), valueSeries(db), readMovers(db), priceState(db), getPriceView()]);

  if (pv.hide) {
    return (
      <section className="mx-auto max-w-md space-y-3 rounded-2xl border border-line bg-panel p-6 text-center">
        <h2 className="text-xl font-semibold">Prices are hidden</h2>
        <p className="text-sm text-muted">You turned prices off in Settings, so the app doesn’t show what your cards are worth.</p>
        <Link href="/settings" className="inline-flex min-h-11 items-center text-sm font-medium text-accent">
          Open Settings
        </Link>
      </section>
    );
  }
  if (totals.copies === 0) {
    return (
      <section className="mx-auto max-w-md space-y-3 rounded-2xl border border-line bg-panel p-6 text-center">
        <h2 className="text-xl font-semibold">Nothing to value yet</h2>
        <p className="text-sm text-muted">Add or import your cards, and their prices are checked each day.</p>
      </section>
    );
  }

  const worth = money(totals.value, pv);
  const approx = totals.estimated + totals.unpriced > 0;
  const points = series.filter((p) => p.usd != null).map((p) => ({ date: p.date, usd: p.usd! }));
  const moved = movers && Math.abs(movers.total) >= 0.01 ? signed(movers.total, pv) : null;

  return (
    <div className="max-w-2xl space-y-3">
      <h1 className="old-look-only text-2xl font-semibold">Value</h1>
      <section className="space-y-3 rounded-2xl border border-line bg-panel p-4">
        <div className="space-y-1">
          <p className="text-sm text-muted">Your collection is worth</p>
          <p className="font-[family-name:var(--font-sora)] text-3xl font-bold tabular-nums">
            {approx && !worth?.startsWith("≈") ? `≈ ${worth}` : worth}
          </p>
          {moved && (
            <p className="text-sm text-muted">
              Price changes{" "}
              <span className={`font-semibold tabular-nums ${movers!.total < 0 ? "text-danger" : "text-ok"}`}>{moved}</span> this week
            </p>
          )}
        </div>
        {points.length >= 2 ? (
          <ValueChart points={points} prices={pv} />
        ) : (
          <p className="text-[13px] text-muted">The chart fills in as prices are checked, once a day.</p>
        )}
        <div className="space-y-0.5 border-t border-line pt-2">
          <p className="text-[13px] text-muted">
            {state.done ? `Prices checked ${formatDateTime(state.done)}` : "Prices haven’t been checked yet"} · TCGplayer prices, from Scryfall. Proxies aren’t counted.
            {totals.unpriced > 0 && ` ${totals.unpriced.toLocaleString("en-AU")} cards have no price.`}
          </p>
          <PriceCheck />
        </div>
      </section>

      {movers && (movers.up.length > 0 || movers.down.length > 0) ? (
        <>
          {movers.up.length > 0 && <MoverList title="Went up this week" movers={movers.up} pv={pv} />}
          {movers.down.length > 0 && <MoverList title="Went down this week" movers={movers.down} pv={pv} />}
        </>
      ) : (
        <p className="px-1 text-sm text-muted">
          {movers ? "None of your cards moved by more than a dollar this week." : "After a few daily checks, the cards that moved most show here."}
        </p>
      )}
    </div>
  );
}

function MoverList({ title, movers, pv }: { title: string; movers: Mover[]; pv: PriceView }) {
  return (
    <section className="space-y-2">
      <h2 className="px-1 text-lg font-semibold">{title}</h2>
      <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-panel">
        {movers.map((m) => (
          <li key={`${m.printingId}-${m.finish}`}>
            <Link href={`/collection/${m.oracleId}`} className="flex min-h-[68px] items-center gap-3 px-3 py-2 hover:bg-(--panel-2)">
              <span className="relative h-[50px] w-9 shrink-0 overflow-hidden rounded-[3px] bg-skeleton">
                {m.imageSmall && <Image src={m.imageSmall} alt="" fill sizes="36px" className="object-cover" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">
                  {m.copies > 1 && <span className="font-normal text-muted">{m.copies}× </span>}
                  {m.name}
                </span>
                <span className="block truncate text-[13px] text-muted tabular-nums">
                  {m.setCode.toUpperCase()}
                  {FINISH[m.finish] ? ` · ${FINISH[m.finish]}` : ""} · {money(m.was, pv)} → {money(m.now, pv)}
                </span>
              </span>
              <span className={`shrink-0 text-sm font-semibold tabular-nums ${m.change < 0 ? "text-danger" : "text-ok"}`}>{signed(m.change, pv)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
