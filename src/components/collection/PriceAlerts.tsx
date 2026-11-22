"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { showDeckToast } from "@/components/deck/DeckRowActions";
import { convert, currencySymbol, formatMoney, toUsd, type PriceView } from "@/lib/money";
import type { AlertFinish, AlertRow, Direction, Quote } from "@/lib/prices/alerts";

type Hit = { oracleId: string; name: string; typeLine: string };

const chip = (on: boolean) =>
  `inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm ${on ? "border-accent bg-panel font-medium" : "border-line hover:bg-background"}`;
const SMALL = "inline-flex min-h-11 shrink-0 items-center rounded-lg border border-line px-3 text-sm font-medium hover:bg-background";
const FINISH_LABEL: Record<AlertFinish, string> = { nonfoil: "Non-foil", foil: "Foil", etched: "Etched" };

/** The new-alert form: a card, which way, and the price, in your currency. */
export function NewAlert({ pv, initial }: { pv: PriceView; initial?: { oracleId: string; name: string; owned: boolean } }) {
  const router = useRouter();
  const [card, setCard] = useState(initial);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [finish, setFinish] = useState<AlertFinish>("nonfoil");
  const [direction, setDirection] = useState<Direction>(initial?.owned ? "above" : "below");
  const [quote, setQuote] = useState<Quote>();
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (q.trim().length < 2) return setHits([]);
    const t = setTimeout(async () => {
      const res = await fetch(`/api/cards/search?q=${encodeURIComponent(q)}`).catch(() => undefined);
      if (res?.ok) setHits(((await res.json()) as { cards: Hit[] }).cards);
    }, 150);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    setQuote(undefined);
    if (!card) return;
    let live = true;
    fetch(`/api/alerts/quote?oracleId=${encodeURIComponent(card.oracleId)}&finish=${finish}`)
      .then((r) => (r.ok ? r.json() : undefined))
      .then((j: { quote?: Quote } | undefined) => {
        if (live && j?.quote) setQuote(j.quote);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [card, finish]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!card) return;
    const n = Number(amount.replace(/[^0-9.]/g, ""));
    if (!(n > 0)) return setError("Type the price to watch for.");
    setBusy(true);
    setError(undefined);
    try {
      const res = await fetch("/api/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ oracleId: card.oracleId, finish, direction, usd: toUsd(n, pv) }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) return setError(j.error ?? "That didn’t save. Try again.");
      showDeckToast({ message: `Watching ${card.name}` });
      setCard(undefined);
      setAmount("");
      router.replace("/collection/alerts");
      router.refresh();
    } catch {
      setError("That didn’t save. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  const now = quote?.usd != null ? formatMoney(quote.usd, { ...pv, hide: false }) : null;

  return (
    <form onSubmit={save} className="space-y-3 rounded-2xl border border-line bg-panel p-4" aria-labelledby="new-alert-h">
      <h2 id="new-alert-h" className="text-lg font-semibold">
        New alert
      </h2>
      {card ? (
        <div className="flex min-h-11 items-center justify-between gap-2">
          <span className="min-w-0">
            <span className="block truncate font-medium">{card.name}</span>
            <span className="block text-[13px] text-muted tabular-nums">
              {quote ? `${quote.label}${quote.owned ? " (yours)" : ""} · ${now ?? "no price yet"}` : "Finding its price…"}
            </span>
          </span>
          <button type="button" className={SMALL} onClick={() => setCard(undefined)}>
            Change
          </button>
        </div>
      ) : (
        <div className="relative">
          <input
            className="h-12 w-full rounded-xl border border-line bg-background px-3 text-base md:h-11 md:text-sm"
            placeholder="Which card?"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Card to watch"
          />
          {hits.length > 0 && (
            <ul className="absolute inset-x-0 top-[calc(100%+4px)] z-10 max-h-72 overflow-auto rounded-xl border border-line bg-panel shadow-lg">
              {hits.map((h) => (
                <li key={h.oracleId}>
                  <button
                    type="button"
                    className="flex min-h-11 w-full flex-col justify-center px-3 py-1 text-left hover:bg-(--panel-2)"
                    onClick={() => {
                      setCard({ oracleId: h.oracleId, name: h.name, owned: false });
                      setQ("");
                      setHits([]);
                    }}
                  >
                    <span className="block truncate text-sm">{h.name}</span>
                    <span className="block truncate text-xs text-muted">{h.typeLine}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Tell me when it">
        <button type="button" className={chip(direction === "below")} aria-pressed={direction === "below"} onClick={() => setDirection("below")}>
          Drops to
        </button>
        <button type="button" className={chip(direction === "above")} aria-pressed={direction === "above"} onClick={() => setDirection("above")}>
          Rises to
        </button>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <label className="block space-y-1">
          <span className="block text-sm text-muted">Price ({currencySymbol(pv)})</span>
          <input
            inputMode="decimal"
            className="h-12 w-32 rounded-xl border border-line bg-background px-3 text-base tabular-nums md:h-11 md:text-sm"
            placeholder={quote?.usd != null ? (convert(quote.usd, pv) * (direction === "below" ? 0.8 : 1.25)).toFixed(2) : "0.00"}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </label>
        <label className="block space-y-1">
          <span className="block text-sm text-muted">Finish</span>
          <select
            className="h-12 rounded-xl border border-line bg-background px-3 text-base md:h-11 md:text-sm"
            value={finish}
            onChange={(e) => setFinish(e.target.value as AlertFinish)}
          >
            {(Object.keys(FINISH_LABEL) as AlertFinish[]).map((f) => (
              <option key={f} value={f}>
                {FINISH_LABEL[f]}
              </option>
            ))}
          </select>
        </label>
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
      <button type="submit" disabled={!card || busy} className="inline-flex min-h-12 items-center justify-center rounded-xl bg-accent px-5 font-semibold text-accent-fg disabled:opacity-50">
        {busy ? "Saving…" : "Watch the price"}
      </button>
      <p className="text-[13px] text-muted">
        Prices are checked once a day. An alert watches the printing you own, or else the cheapest regular printing, and goes off once.
      </p>
    </form>
  );
}

/** The alerts: the ones that went off (with Clear), then the ones still watching (with Stop). */
export function AlertList({ alerts, pv }: { alerts: AlertRow[]; pv: PriceView }) {
  const router = useRouter();
  const [gone, setGone] = useState<Set<number>>(new Set());
  const m = (usd: number | null) => formatMoney(usd, { ...pv, hide: false });

  async function remove(a: AlertRow) {
    setGone((g) => new Set(g).add(a.id));
    const res = await fetch(`/api/alerts/${a.id}`, { method: "DELETE" }).catch(() => undefined);
    if (!res || (!res.ok && res.status !== 404)) {
      setGone((g) => {
        const n = new Set(g);
        n.delete(a.id);
        return n;
      });
      showDeckToast({ message: "That didn’t work. Try again.", error: true });
      return;
    }
    router.refresh();
  }

  const shown = alerts.filter((a) => !gone.has(a.id));
  const fired = shown.filter((a) => a.firedAt);
  const waiting = shown.filter((a) => !a.firedAt);
  if (!shown.length) return <p className="rounded-2xl border border-line bg-panel p-4 text-sm text-muted">No price alerts yet. Pick a card below and the price to watch for.</p>;

  const row = (a: AlertRow) => (
    <li key={a.id} className="flex min-h-16 items-center gap-3 px-3 py-2">
      <Link href={`/collection/${a.oracleId}`} className="relative h-[42px] w-[30px] shrink-0 overflow-hidden rounded-[3px] bg-skeleton" aria-hidden tabIndex={-1}>
        {a.imageSmall && <Image src={a.imageSmall} alt="" fill sizes="30px" className="object-cover" />}
      </Link>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{a.name}</span>
        <span className="block text-[13px] text-muted tabular-nums">
          {a.firedAt
            ? `${a.direction === "below" ? "Down" : "Up"} to ${m(a.firedUsd)} · your line ${m(a.usd)}`
            : `${a.direction === "below" ? "Drops to" : "Rises to"} ${m(a.usd)} · now ${m(a.nowUsd)}`}
        </span>
        <span className="block truncate text-[13px] text-muted">{a.label}</span>
      </span>
      <button type="button" className={SMALL} onClick={() => remove(a)} aria-label={`${a.firedAt ? "Clear" : "Stop"} the alert on ${a.name}`}>
        {a.firedAt ? "Clear" : "Stop"}
      </button>
    </li>
  );

  return (
    <div className="space-y-3">
      {fired.length > 0 && (
        <section className="space-y-2" aria-labelledby="fired-h">
          <h2 id="fired-h" className="px-1 text-lg font-semibold">
            Went off
          </h2>
          <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-accent bg-panel">{fired.map(row)}</ul>
        </section>
      )}
      {waiting.length > 0 && (
        <section className="space-y-2" aria-labelledby="waiting-h">
          <h2 id="waiting-h" className="px-1 text-lg font-semibold">
            Watching
          </h2>
          <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-panel">{waiting.map(row)}</ul>
        </section>
      )}
    </div>
  );
}
