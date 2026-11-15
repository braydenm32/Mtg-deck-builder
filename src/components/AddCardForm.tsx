"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useId, useState } from "react";
import { Icon } from "./shell/icons";
import { Sheet } from "./add/Sheet";
import { Toast, useToast } from "./add/Toast";
import { plural, shorterQuery } from "./add/text";
import { Button, Panel, Skeleton } from "./ui";

type Suggestion = { oracleId: string; name: string; typeLine: string; imageSmall: string | null };
type Printing = {
  id: string;
  oracleId: string;
  name: string;
  setCode: string;
  setName: string;
  collectorNumber: string;
  lang: string;
  finishes: string[];
  imageSmall: string | null;
  releasedAt: string | null;
};
type Saved = { key: number; oracleId: string; text: string };
type Defaults = { condition: string; location: string };

const CONDITIONS = ["NM", "LP", "MP", "HP", "DMG"];
const FINISH_LABEL: Record<string, string> = { nonfoil: "Non-foil", foil: "Foil", etched: "Etched" };
const finishLabel = (f: string) => FINISH_LABEL[f] ?? f;

/**
 * Add a card by name.
 * - On Add cards → Type a name: search, then pick a result to choose the printing in a sheet.
 * - With `lockedName` (a card's own page): just the printing form for that card.
 */
export function AddCardForm({ initialQuery = "", lockedName }: { initialQuery?: string; lockedName?: string }) {
  if (lockedName) return <LockedAdd name={lockedName} />;
  return <CardSearchAdd initialQuery={initialQuery} />;
}

/* ------------------------------------------------ card page ------------------------------------------------ */

function LockedAdd({ name }: { name: string }) {
  const router = useRouter();
  const [defaults, setDefaults] = useState<Defaults>({ condition: "NM", location: "" });
  const [saved, setSaved] = useState<Saved[]>([]);
  return (
    <Panel className="space-y-3">
      <PrintingForm
        name={name}
        defaults={defaults}
        onDefaults={setDefaults}
        layout="inline"
        onSaved={(s) => {
          setSaved((l) => [s, ...l]);
          router.refresh();
        }}
      />
      {saved.length > 0 && (
        <ul className="space-y-1 text-sm" role="status" aria-live="polite">
          {saved.map((s) => (
            <li key={s.key} className="text-ok">
              ✓ Saved {s.text}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

/* ---------------------------------------------- Type a name ---------------------------------------------- */

function CardSearchAdd({ initialQuery }: { initialQuery: string }) {
  const params = useSearchParams();
  // Read the address on mount too, so Back (which can reuse an older render) lands on the same search.
  const [query, setQuery] = useState(() => params.get("q") ?? initialQuery);
  const [results, setResults] = useState<Suggestion[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [retry, setRetry] = useState(0);
  const [picked, setPicked] = useState<Suggestion | null>(null);
  const [defaults, setDefaults] = useState<Defaults>({ condition: "NM", location: "" });
  const [saved, setSaved] = useState<Saved[]>([]);
  const { toast, show } = useToast();
  const listId = useId();
  const q = query.trim();

  // Search as you type (debounced). An older, slower answer never replaces a newer one.
  useEffect(() => {
    if (q.length < 2) {
      setResults([]);
      setStatus("idle");
      return;
    }
    const ctrl = new AbortController();
    setStatus("loading");
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/cards/search?q=${encodeURIComponent(q)}`, { signal: ctrl.signal });
        if (!res.ok) throw new Error(String(res.status));
        setResults(((await res.json()).cards ?? []) as Suggestion[]);
        setStatus("done");
      } catch {
        if (!ctrl.signal.aborted) setStatus("error");
      }
    }, 150);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q, retry]);

  // Keep the search in the address (?q=), so Back and reload land on the same results.
  useEffect(() => {
    const t = setTimeout(() => {
      const { pathname, search } = window.location;
      const next = q ? `${pathname}?q=${encodeURIComponent(q)}` : pathname;
      if (next !== pathname + search) window.history.replaceState(null, "", next);
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  const shorter = status === "done" && results.length === 0 ? shorterQuery(q) : undefined;

  return (
    <div className="grid gap-6 min-[900px]:grid-cols-[minmax(0,1fr)_18rem] min-[900px]:items-start">
      <div className="min-w-0 space-y-3">
        <div className="relative">
          <label htmlFor="card-search" className="sr-only">
            Card name
          </label>
          <Icon name="search" className="pointer-events-none absolute top-1/2 left-3 h-5! w-5! -translate-y-1/2 text-muted" />
          <input
            id="card-search"
            type="search"
            autoFocus
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="none"
            spellCheck={false}
            enterKeyHint="search"
            aria-controls={listId}
            className="h-12 w-full rounded-xl border border-line bg-panel pr-12 pl-10 text-base text-foreground placeholder:text-muted [&::-webkit-search-cancel-button]:appearance-none"
            placeholder="Card name, e.g. Sol Ring"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              // Enter opens the top result, so a laptop never needs the mouse.
              if (e.key === "Enter" && results[0] && status === "done") {
                e.preventDefault();
                setPicked(results[0]);
              }
            }}
          />
          {query && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => {
                setQuery("");
                document.getElementById("card-search")?.focus();
              }}
              className="absolute top-1/2 right-0.5 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-lg text-xl leading-none text-muted hover:text-foreground"
            >
              ×
            </button>
          )}
        </div>

        {/* Phone: the latest save stays right under the search, with the rest one tap away. */}
        {saved.length > 0 && (
          <div className="rounded-xl border border-line bg-panel min-[900px]:hidden">
            <SavedRow s={saved[0]} />
            {saved.length > 1 && (
              <details className="border-t border-line">
                <summary className="flex min-h-11 cursor-pointer items-center px-3 text-sm text-muted">
                  {plural(saved.length - 1, "more", "more")} added this visit
                </summary>
                <ul className="divide-y divide-line border-t border-line">
                  {saved.slice(1).map((s) => (
                    <li key={s.key}>
                      <SavedRow s={s} />
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}

        <div id={listId} aria-busy={status === "loading"}>
          {status === "idle" && <p className="text-sm text-muted">Type two or more letters. Pick the card, then the printing you have.</p>}

          {status === "loading" && results.length === 0 && (
            <div className="space-y-px overflow-hidden rounded-xl border border-line" aria-label="Searching">
              {Array.from({ length: 4 }, (_, i) => (
                <div key={i} className="flex items-center gap-3 bg-panel px-3 py-2">
                  <Skeleton className="h-14 w-10 shrink-0" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-1/2" />
                    <Skeleton className="h-3 w-1/3" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {status === "error" && (
            <div className="flex flex-wrap items-center gap-3 rounded-xl bg-danger-bg p-3 text-sm text-danger" role="alert">
              <span className="flex-1">Couldn&apos;t search just now.</span>
              <Button variant="secondary" className="min-h-11" onClick={() => setRetry((n) => n + 1)}>
                Try again
              </Button>
            </div>
          )}

          {status === "done" && results.length === 0 && (
            <div className="space-y-3 rounded-xl border border-dashed border-line p-4 text-sm">
              <p>
                No card called <span className="font-medium">“{q}”</span>.
              </p>
              <p className="text-muted">Check the spelling. Part of a name works too.</p>
              {shorter && (
                <Button variant="secondary" className="min-h-11" onClick={() => setQuery(shorter)}>
                  Search “{shorter}”
                </Button>
              )}
            </div>
          )}

          {results.length > 0 && status !== "idle" && (
            <ul className={`divide-y divide-line overflow-hidden rounded-xl border border-line bg-panel ${status === "loading" ? "opacity-70" : ""}`}>
              {results.map((r) => (
                <li key={r.oracleId}>
                  <button
                    type="button"
                    onClick={() => setPicked(r)}
                    className="flex min-h-16 w-full items-center gap-3 px-3 py-2 text-left hover:bg-background focus-visible:bg-background"
                  >
                    <span className="relative h-14 w-10 shrink-0 overflow-hidden rounded-[4px] bg-skeleton">
                      {r.imageSmall && <Image src={r.imageSmall} alt="" fill sizes="40px" className="object-cover" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{r.name}</span>
                      <span className="block truncate text-sm text-muted">{r.typeLine}</span>
                    </span>
                    <span className="shrink-0 text-sm font-medium text-accent">Add</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Laptop: every save this visit, beside the results. */}
      <section aria-labelledby="added-heading" className="hidden space-y-2 min-[900px]:sticky min-[900px]:top-32 min-[900px]:block">
        <h2 id="added-heading" className="text-sm font-semibold text-muted">
          Added this visit
        </h2>
        {saved.length > 0 ? (
          <ul className="divide-y divide-line rounded-xl border border-line bg-panel">
            {saved.map((s) => (
              <li key={s.key}>
                <SavedRow s={s} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-xl border border-dashed border-line p-4 text-sm text-muted">Each card you add shows here once it&apos;s saved.</p>
        )}
      </section>

      <Sheet open={!!picked} onClose={() => setPicked(null)} title={picked?.name}>
        {picked && (
          <PrintingForm
            key={picked.oracleId}
            name={picked.name}
            defaults={defaults}
            onDefaults={setDefaults}
            layout="sheet"
            onSaved={(s) => {
              setSaved((l) => [s, ...l]);
              show(`Saved ${s.text}`);
              setPicked(null);
            }}
          />
        )}
      </Sheet>
      <Toast toast={toast} />
    </div>
  );
}

function SavedRow({ s }: { s: Saved }) {
  return (
    <div className="flex min-h-12 items-center gap-2 pl-3">
      <span aria-hidden="true" className="text-ok">
        ✓
      </span>
      <span className="min-w-0 flex-1 py-2 text-sm">
        <span className="text-muted">Saved </span>
        {s.text}
      </span>
      <Link href={`/collection/${s.oracleId}`} className="inline-flex min-h-11 shrink-0 items-center px-3 text-sm font-medium text-accent">
        View
      </Link>
    </div>
  );
}

/* ------------------------------------------- printing, finish, copies ------------------------------------------- */

function PrintingForm({
  name,
  defaults,
  onDefaults,
  onSaved,
  layout,
}: {
  name: string;
  /** Condition and place carry over from one add to the next, so a stack of cards for one binder is quick. */
  defaults: Defaults;
  onDefaults: (d: Defaults) => void;
  onSaved: (s: Saved) => void;
  layout: "sheet" | "inline";
}) {
  const [load, setLoad] = useState<"loading" | "ready" | "empty" | "error">("loading");
  const [attempt, setAttempt] = useState(0);
  const [printings, setPrintings] = useState<Printing[]>([]);
  const [printingId, setPrintingId] = useState<string>();
  const [finish, setFinish] = useState("nonfoil");
  const [quantity, setQuantity] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const ids = useId();

  // Load the printings of the chosen card.
  useEffect(() => {
    let live = true;
    setLoad("loading");
    (async () => {
      try {
        const res = await fetch(`/api/cards/lookup?name=${encodeURIComponent(name)}`);
        if (!res.ok) throw new Error(String(res.status));
        const list: Printing[] = (await res.json()).printings ?? [];
        if (!live) return;
        setPrintings(list);
        setPrintingId(list[0]?.id);
        setFinish(list[0]?.finishes[0] ?? "nonfoil");
        setLoad(list.length ? "ready" : "empty");
      } catch {
        if (live) setLoad("error");
      }
    })();
    return () => {
      live = false;
    };
  }, [name, attempt]);

  const printing = printings.find((p) => p.id === printingId);

  async function add() {
    if (!printing || busy) return;
    setBusy(true);
    setError(undefined);
    const text = `${quantity}× ${printing.name} · ${printing.setCode.toUpperCase()} #${printing.collectorNumber}${finish !== "nonfoil" ? ` · ${finishLabel(finish).toLowerCase()}` : ""}${defaults.location.trim() ? ` · ${defaults.location.trim()}` : ""}`;
    try {
      const res = await fetch("/api/collection/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: "manual",
          cards: [
            {
              scryfallId: printing.id,
              quantity,
              finish,
              condition: defaults.condition,
              location: defaults.location || undefined,
              lang: printing.lang,
            },
          ],
        }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body?.added?.length) {
        const why = body?.unmatched?.[0]?.reason ?? body?.error;
        setError(`Not saved${why ? `: ${why}` : ` (error ${res.status})`}. Try again.`);
        return;
      }
      setQuantity(1);
      onSaved({ key: Date.now(), oracleId: printing.oracleId, text });
    } catch {
      setError("Not saved: couldn't reach the app. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  if (load === "loading")
    return (
      <div className="space-y-3" aria-busy="true">
        <span className="sr-only">Loading printings…</span>
        <div className="flex gap-3">
          <Skeleton className="h-[78px] w-14 shrink-0" />
          <Skeleton className="h-12 flex-1 self-end" />
        </div>
        <Skeleton className="h-11 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    );
  if (load === "error")
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-xl bg-danger-bg p-3 text-sm text-danger" role="alert">
        <span className="flex-1">Couldn&apos;t load the printings of {name}.</span>
        <Button variant="secondary" className="min-h-11" onClick={() => setAttempt((n) => n + 1)}>
          Try again
        </Button>
      </div>
    );
  if (load === "empty") return <p className="text-sm text-muted">The card data has no paper printings of {name}, so it can&apos;t be added yet.</p>;

  const field = "h-12 w-full min-w-0 rounded-lg border border-line bg-background px-3 text-base text-foreground";
  const label = "block text-sm font-medium text-muted";
  const copies = `${quantity} ${quantity === 1 ? "copy" : "copies"}`;

  return (
    <form
      className={`space-y-4 ${layout === "inline" ? "max-w-xl" : ""}`}
      onSubmit={(e) => {
        e.preventDefault();
        add();
      }}
    >
      <div className="flex items-end gap-3">
        <span className="relative h-[78px] w-14 shrink-0 overflow-hidden rounded-[4px] bg-skeleton">
          {printing?.imageSmall && <Image src={printing.imageSmall} alt="" fill sizes="56px" className="object-cover" />}
        </span>
        <label className="min-w-0 flex-1 space-y-1">
          <span className={label}>Printing{printings.length > 1 ? ` (${printings.length})` : ""}</span>
          <select
            className={field}
            value={printingId}
            onChange={(e) => {
              setPrintingId(e.target.value);
              const p = printings.find((x) => x.id === e.target.value);
              if (p && !p.finishes.includes(finish)) setFinish(p.finishes[0] ?? "nonfoil");
            }}
          >
            {printings.map((p) => (
              <option key={p.id} value={p.id}>
                {p.setName} ({p.setCode.toUpperCase()}) #{p.collectorNumber}
                {p.lang !== "en" ? ` · ${p.lang.toUpperCase()}` : ""}
              </option>
            ))}
          </select>
        </label>
      </div>

      <fieldset className="space-y-1">
        <legend className={label}>Finish</legend>
        {(printing?.finishes.length ?? 0) > 1 ? (
          <div className="flex gap-1 rounded-lg border border-line bg-background p-1">
            {printing!.finishes.map((f) => (
              <label key={f} className="flex-1">
                <input type="radio" name={`${ids}-finish`} value={f} checked={finish === f} onChange={() => setFinish(f)} className="peer sr-only" />
                <span className="flex min-h-11 cursor-pointer items-center justify-center rounded-md px-2 text-sm text-muted peer-checked:bg-panel peer-checked:font-semibold peer-checked:text-foreground peer-checked:shadow-sm peer-checked:ring-1 peer-checked:ring-accent peer-focus-visible:outline-2 peer-focus-visible:outline-accent">
                  {finishLabel(f)}
                </span>
              </label>
            ))}
          </div>
        ) : (
          <p className="text-sm">{finishLabel(printing?.finishes[0] ?? finish)} only</p>
        )}
      </fieldset>

      <div className={`grid grid-cols-2 gap-3 ${layout === "inline" ? "sm:grid-cols-[1fr_1fr_2fr]" : ""}`}>
        <label className="space-y-1">
          <span className={label}>Condition</span>
          <select className={field} value={defaults.condition} onChange={(e) => onDefaults({ ...defaults, condition: e.target.value })}>
            {CONDITIONS.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <div className="space-y-1">
          <label htmlFor={`${ids}-qty`} className={label}>
            Copies
          </label>
          <div className="flex h-12 items-stretch overflow-hidden rounded-lg border border-line bg-background">
            <button
              type="button"
              aria-label="One fewer"
              disabled={quantity <= 1}
              onClick={() => setQuantity((n) => Math.max(1, n - 1))}
              className="w-11 shrink-0 text-lg text-muted hover:text-foreground disabled:opacity-40"
            >
              −
            </button>
            <input
              id={`${ids}-qty`}
              type="number"
              inputMode="numeric"
              min={1}
              max={1000}
              value={quantity}
              onChange={(e) => setQuantity(Math.min(1000, Math.max(1, Math.floor(Number(e.target.value)) || 1)))}
              className="w-full min-w-0 bg-transparent text-center text-base tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
            />
            <button
              type="button"
              aria-label="One more"
              onClick={() => setQuantity((n) => Math.min(1000, n + 1))}
              className="w-11 shrink-0 text-lg text-muted hover:text-foreground"
            >
              +
            </button>
          </div>
        </div>
        <label className={`space-y-1 ${layout === "inline" ? "col-span-2 sm:col-span-1" : "col-span-2"}`}>
          <span className={label}>Where it lives (optional)</span>
          <input
            className={field}
            placeholder="Binder, box…"
            value={defaults.location}
            onChange={(e) => onDefaults({ ...defaults, location: e.target.value })}
          />
        </label>
      </div>

      {error && (
        <p className="rounded-lg bg-danger-bg p-3 text-sm text-danger" role="alert">
          {error}
        </p>
      )}

      <Button type="submit" className={`min-h-12 text-base ${layout === "sheet" ? "w-full" : ""}`} disabled={busy || !printing} data-autofocus>
        {busy ? "Adding…" : `Add ${copies}`}
      </Button>
    </form>
  );
}
