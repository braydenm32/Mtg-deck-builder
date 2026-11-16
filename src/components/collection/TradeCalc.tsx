"use client";

import { useEffect, useState } from "react";
import { convert, currencySymbol, formatMoney, toUsd, type PriceView } from "@/lib/money";
import { addLine, tradeTotals, tradeVerdict, type TradeLine } from "@/lib/collection/trade";

/**
 * The trade calculator: the cards you give on one side, the cards you get on the other, each at
 * its market price to start (tap a price to change it to what you agreed). Shows who comes out ahead
 * and the cash that evens it. Kept on this device until you clear it, so a trade at the table
 * survives the phone locking.
 */

const KEY = "trade-calc";
type Side = "give" | "get";
type Saved = { give: TradeLine[]; get: TradeLine[] };
type Hit = { oracleId: string; name: string; typeLine: string; priceUsd: number | null };
export type TradeOffer = { oracleId: string; name: string; priceUsd: number | null };

const SMALL = "inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-line px-2 text-sm font-medium hover:bg-background";

export function TradeCalc({ pv, offers }: { pv: PriceView; offers: TradeOffer[] }) {
  const [trade, setTrade] = useState<Saved>({ give: [], get: [] });
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(KEY);
      if (raw) setTrade(JSON.parse(raw) as Saved);
    } catch {
      // No storage: the trade just won't survive a reload.
    }
    setLoaded(true);
  }, []);
  useEffect(() => {
    if (!loaded) return;
    try {
      if (trade.give.length || trade.get.length) window.localStorage.setItem(KEY, JSON.stringify(trade));
      else window.localStorage.removeItem(KEY);
    } catch {
      // Ignore: see above.
    }
  }, [trade, loaded]);

  const t = tradeTotals(trade.give, trade.get);
  const verdict = tradeVerdict(t);
  const m = (usd: number) => formatMoney(usd, pv) ?? "";
  const update = (side: Side, lines: TradeLine[]) => setTrade((x) => ({ ...x, [side]: lines }));
  const offered = offers.filter((o) => !trade.give.some((l) => l.oracleId === o.oracleId)).slice(0, 8);

  return (
    <section className="space-y-3" aria-labelledby="calc-h">
      <div className="flex items-baseline justify-between gap-2 px-1">
        <h2 id="calc-h" className="text-lg font-semibold">
          Trade calculator
        </h2>
        {(trade.give.length > 0 || trade.get.length > 0) && (
          <button type="button" className="inline-flex min-h-11 items-center px-2 text-sm text-muted hover:text-foreground" onClick={() => setTrade({ give: [], get: [] })}>
            Start again
          </button>
        )}
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <TradeSide title="You give" side="give" lines={trade.give} pv={pv} total={t.give} onChange={(l) => update("give", l)}>
          {offered.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {offered.map((o) => (
                <button
                  key={o.oracleId}
                  type="button"
                  className="inline-flex min-h-11 items-center rounded-full border border-line px-3.5 text-sm text-muted hover:text-foreground"
                  onClick={() => update("give", addLine(trade.give, o))}
                >
                  + {o.name}
                </button>
              ))}
            </div>
          )}
        </TradeSide>
        <TradeSide title="You get" side="get" lines={trade.get} pv={pv} total={t.get} onChange={(l) => update("get", l)} />
      </div>

      {(trade.give.length > 0 || trade.get.length > 0) && !pv.hide && (
        <div className={`rounded-2xl border p-4 ${verdict === "even" ? "border-line bg-panel" : "border-accent bg-panel"}`} aria-live="polite">
          <p className="font-[family-name:var(--font-sora)] text-xl font-bold">
            {verdict === "even" ? "About even" : verdict === "you-ahead" ? `You come out ${m(t.difference)} ahead` : `They come out ${m(-t.difference)} ahead`}
          </p>
          <p className="text-sm text-muted">
            You give {m(t.give)}, you get {m(t.get)}.
            {verdict === "you-ahead" && ` To even it, you'd add ${m(t.difference)} in cash.`}
            {verdict === "they-ahead" && ` To even it, they'd add ${m(-t.difference)} in cash.`}
            {t.unpriced > 0 && ` ${t.unpriced} ${t.unpriced === 1 ? "card has" : "cards have"} no price, so ${t.unpriced === 1 ? "it isn't" : "they aren't"} counted.`}
          </p>
        </div>
      )}
      {pv.hide && <p className="px-1 text-sm text-muted">Prices are turned off in Settings, so the calculator can&rsquo;t add up the trade.</p>}
    </section>
  );
}

function TradeSide({
  title,
  side,
  lines,
  pv,
  total,
  onChange,
  children,
}: {
  title: string;
  side: Side;
  lines: TradeLine[];
  pv: PriceView;
  total: number;
  onChange: (lines: TradeLine[]) => void;
  children?: React.ReactNode;
}) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);

  useEffect(() => {
    if (q.trim().length < 2) return setHits([]);
    const t = setTimeout(async () => {
      const res = await fetch(`/api/cards/search?q=${encodeURIComponent(q)}&prices=1`).catch(() => undefined);
      if (res?.ok) setHits(((await res.json()) as { cards: Hit[] }).cards);
    }, 150);
    return () => clearTimeout(t);
  }, [q]);

  const set = (i: number, patch: Partial<TradeLine>) => onChange(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const step = (i: number, by: number) => {
    const n = lines[i].quantity + by;
    onChange(n <= 0 ? lines.filter((_, j) => j !== i) : lines.map((l, j) => (j === i ? { ...l, quantity: n } : l)));
  };

  return (
    <div className="space-y-2 rounded-2xl border border-line bg-panel p-3">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="font-semibold">{title}</h3>
        {!pv.hide && <span className="text-sm font-semibold tabular-nums">{formatMoney(total, pv)}</span>}
      </div>
      <div className="relative">
        <input
          className="h-12 w-full rounded-xl border border-line bg-background px-3 text-base md:h-11 md:text-sm"
          placeholder="Add a card…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label={`${title}: add a card`}
        />
        {hits.length > 0 && (
          <ul className="absolute inset-x-0 top-[calc(100%+4px)] z-10 max-h-72 overflow-auto rounded-xl border border-line bg-panel shadow-lg">
            {hits.map((h) => (
              <li key={h.oracleId}>
                <button
                  type="button"
                  className="flex min-h-11 w-full items-center justify-between gap-2 px-3 py-1 text-left hover:bg-(--panel-2)"
                  onClick={() => {
                    onChange(addLine(lines, { oracleId: h.oracleId, name: h.name, priceUsd: h.priceUsd }));
                    setQ("");
                    setHits([]);
                  }}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm">{h.name}</span>
                    <span className="block truncate text-xs text-muted">{h.typeLine}</span>
                  </span>
                  {!pv.hide && <span className="shrink-0 text-xs text-muted tabular-nums">{formatMoney(h.priceUsd, pv)}</span>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {children}
      {lines.length === 0 ? (
        <p className="py-2 text-sm text-muted">{side === "give" ? "Cards you hand over." : "Cards you take home."}</p>
      ) : (
        <ul className="divide-y divide-line">
          {lines.map((l, i) => (
            <li key={l.oracleId} className="flex min-h-14 items-center gap-2 py-1">
              <span className="min-w-0 flex-1 text-sm font-medium">{l.name}</span>
              <button type="button" className={SMALL} onClick={() => step(i, -1)} aria-label={l.quantity === 1 ? `Take ${l.name} off` : `One less ${l.name}`}>
                −
              </button>
              <span className="w-6 text-center text-sm font-semibold tabular-nums">{l.quantity}</span>
              <button type="button" className={SMALL} onClick={() => step(i, 1)} aria-label={`One more ${l.name}`}>
                +
              </button>
              {!pv.hide && <PriceInput pv={pv} usd={l.priceUsd} name={l.name} onChange={(usd) => set(i, { priceUsd: usd })} />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Each copy's price in the user's currency; blank for none. */
function PriceInput({ pv, usd, name, onChange }: { pv: PriceView; usd: number | null; name: string; onChange: (usd: number | null) => void }) {
  const shown = usd == null ? "" : convert(usd, pv).toFixed(2);
  const [text, setText] = useState(shown);
  useEffect(() => setText(shown), [shown]);
  return (
    <label className="flex h-11 w-24 shrink-0 items-center gap-0.5 rounded-lg border border-line bg-background px-2 text-sm">
      <span className="text-xs text-muted">{currencySymbol(pv)}</span>
      <input
        className="w-full min-w-0 bg-transparent text-right tabular-nums outline-none"
        inputMode="decimal"
        value={text}
        aria-label={`${name}: price each`}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          const n = Number.parseFloat(text.replace(/[^0-9.]/g, ""));
          onChange(Number.isFinite(n) && n >= 0 ? Math.round(toUsd(n, pv) * 100) / 100 : null);
        }}
      />
    </label>
  );
}
