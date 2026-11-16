import Image from "next/image";
import Link from "next/link";
import { getDb } from "@/db/client";
import { PriceCheck } from "@/components/collection/PriceCheck";
import { ValueChart } from "@/components/collection/ValueChart";
import { money } from "@/components/ui";
import { CurveBars, StatBars } from "@/components/collection/StatBars";
import { collectionStats, type CollectionStats } from "@/lib/collection/collection-stats";
import { collectionGains, conditionValue, type Gains } from "@/lib/collection/gains";
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
  const [totals, series, movers, state, pv, stats, gains, cond] = await Promise.all([
    collectionTotals(db),
    valueSeries(db),
    readMovers(db),
    priceState(db),
    getPriceView(),
    collectionStats(db),
    collectionGains(db),
    conditionValue(db),
  ]);

  if (totals.copies === 0) {
    return (
      <section className="mx-auto max-w-md space-y-3 rounded-2xl border border-line bg-panel p-6 text-center">
        <h2 className="text-xl font-semibold">Nothing here yet</h2>
        <p className="text-sm text-muted">Add or import your cards to see what they&rsquo;re worth, and your collection at a glance.</p>
      </section>
    );
  }

  const glance = <Glance stats={stats} />;
  if (pv.hide) {
    return (
      <div className="max-w-2xl space-y-3">
        <h1 className="old-look-only text-2xl font-semibold">Stats</h1>
        <p className="px-1 text-sm text-muted">
          Prices are turned off, so values aren&rsquo;t shown.{" "}
          <Link href="/settings" className="font-medium text-accent">
            Settings
          </Link>
        </p>
        {glance}
      </div>
    );
  }

  const worth = money(totals.value, pv);
  const approx = totals.estimated + totals.unpriced > 0;
  const points = series.filter((p) => p.usd != null).map((p) => ({ date: p.date, usd: p.usd! }));
  const moved = movers && Math.abs(movers.total) >= 0.01 ? signed(movers.total, pv) : null;

  return (
    <div className="max-w-2xl space-y-3">
      <h1 className="old-look-only text-2xl font-semibold">Value and stats</h1>
      <section className="space-y-3 rounded-2xl border border-line bg-panel p-4">
        <div className="space-y-1">
          <p className="text-sm text-muted">Your collection is worth</p>
          <p className="font-[family-name:var(--font-sora)] text-3xl font-bold tabular-nums">
            {approx && !worth?.startsWith("≈") ? `≈ ${worth}` : worth}
          </p>
          {cond.played > 0 && cond.adjusted != null && cond.less >= 0.01 && (
            <p className="text-sm text-muted">
              Allowing for condition, about <span className="font-semibold text-foreground tabular-nums">{money(cond.adjusted, pv)}</span>: your{" "}
              {cond.played.toLocaleString("en-AU")} played {cond.played === 1 ? "copy counts" : "copies count"} at less than the near-mint price.
            </p>
          )}
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

      <Paid gains={gains} pv={pv} />

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
      {glance}
    </div>
  );
}

const fmt = (n: number) => n.toLocaleString("en-AU");

/** The collection at a glance: a few counts, then colours, types, curve, rarities and sets. */
function Glance({ stats }: { stats: CollectionStats }) {
  const f = stats.facts;
  const tiles: { label: string; value: string; href?: string }[] = [
    { label: "Unique cards", value: fmt(f.unique), href: "/collection" },
    { label: "Commanders", value: fmt(f.commanders), href: "/collection?commander=1" },
    { label: "Game Changers", value: fmt(f.gameChangers), href: `/collection?q=${encodeURIComponent("is:gamechanger")}` },
    { label: "Foils", value: fmt(f.foils), href: `/collection?q=${encodeURIComponent("is:foil")}` },
  ];
  return (
    <section className="space-y-3 pt-3">
      <h2 className="px-1 text-lg font-semibold">At a glance</h2>
      <div className="grid grid-cols-2 overflow-hidden rounded-2xl border border-line bg-panel sm:grid-cols-4">
        {tiles.map((t, i) => (
          <Link key={t.label} href={t.href!} className={`p-3 hover:bg-(--panel-2) ${i % 2 ? "border-l border-line" : ""} ${i >= 2 ? "border-t border-line sm:border-t-0" : ""} ${i === 2 ? "sm:border-l" : ""}`}>
            <span className="block text-xs text-muted">{t.label}</span>
            <span className="block font-[family-name:var(--font-sora)] text-2xl font-bold tabular-nums">{t.value}</span>
          </Link>
        ))}
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <StatBars title="Colour identity" bars={stats.colours} note="Unique cards, basic lands left out." />
        <CurveBars bars={stats.curve} average={f.averageMv} />
        <StatBars title="Card types" bars={stats.types} note="A card with two types counts in both." />
        <StatBars title="Rarity" bars={stats.rarities} note="Copies, proxies included." />
        <StatBars title="Top sets" bars={stats.sets} note={`Copies. You own cards from ${fmt(stats.setCount)} ${stats.setCount === 1 ? "set" : "sets"}.`} />
      </div>
    </section>
  );
}

/** What you paid against what it's worth now, for copies with a purchase price. */
function Paid({ gains, pv }: { gains: Gains; pv: PriceView }) {
  if (gains.copies === 0) {
    return (
      <p className="px-1 text-sm text-muted">
        Add what you paid from a card&rsquo;s copies (its &ldquo;⋯&rdquo; menu), or import a CSV with purchase prices, to see what you&rsquo;ve gained or lost.
      </p>
    );
  }
  const change = gains.worth - gains.paid;
  const lists = [
    { title: "Gained most", list: gains.up },
    { title: "Lost most", list: gains.down },
  ].filter((l) => l.list.length > 0);
  return (
    <section className="space-y-3 rounded-2xl border border-line bg-panel p-4" aria-labelledby="paid-h">
      <h2 id="paid-h" className="text-lg font-semibold">
        What you paid
      </h2>
      <p className="text-sm">
        You paid <span className="font-semibold tabular-nums">{money(gains.paid, pv)}</span> for {gains.copies.toLocaleString("en-AU")}{" "}
        {gains.copies === 1 ? "copy" : "copies"} now worth <span className="font-semibold tabular-nums">{money(gains.worth, pv)}</span>:{" "}
        <span className={`font-semibold tabular-nums ${change < 0 ? "text-danger" : "text-ok"}`}>{signed(change, pv) ?? money(0, pv)}</span>.
      </p>
      {lists.map(({ title, list }) => (
        <div key={title} className="space-y-1">
          <h3 className="text-sm font-semibold">{title}</h3>
          <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line">
            {list.map((g) => (
              <li key={`${g.oracleId}-${g.setCode}-${g.finish}-${g.paid}`}>
                <Link href={`/collection/${g.oracleId}`} className="flex min-h-14 items-center gap-3 px-3 py-2 hover:bg-(--panel-2)">
                  <span className="relative h-[42px] w-[30px] shrink-0 overflow-hidden rounded-[3px] bg-skeleton">
                    {g.imageSmall && <Image src={g.imageSmall} alt="" fill sizes="30px" className="object-cover" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">
                      {g.copies > 1 && <span className="font-normal text-muted">{g.copies}× </span>}
                      {g.name}
                    </span>
                    <span className="block text-[13px] text-muted tabular-nums">
                      {g.setCode.toUpperCase()}
                      {FINISH[g.finish] ? ` · ${FINISH[g.finish]}` : ""} · paid {money(g.paid, pv)}, now {money(g.now, pv)}
                    </span>
                  </span>
                  <span className={`shrink-0 text-sm font-semibold tabular-nums ${g.change < 0 ? "text-danger" : "text-ok"}`}>{signed(g.change, pv)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
      <p className="text-xs text-muted">Purchase prices from a CSV are read as US dollars. Proxies aren&rsquo;t counted.</p>
    </section>
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
