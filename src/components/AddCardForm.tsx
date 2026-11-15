"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button, Panel } from "./ui";

type Suggestion = { oracleId: string; name: string; typeLine: string; imageSmall: string | null };
type Printing = {
  id: string;
  name: string;
  setCode: string;
  setName: string;
  collectorNumber: string;
  lang: string;
  finishes: string[];
  imageSmall: string | null;
  releasedAt: string | null;
};

const CONDITIONS = ["NM", "LP", "MP", "HP", "DMG"];

export function AddCardForm({ initialQuery = "", lockedName }: { initialQuery?: string; lockedName?: string }) {
  const router = useRouter();
  const [query, setQuery] = useState(lockedName ?? initialQuery);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [name, setName] = useState<string | undefined>(lockedName);
  const [printings, setPrintings] = useState<Printing[]>([]);
  const [printingId, setPrintingId] = useState<string>();
  const [finish, setFinish] = useState("nonfoil");
  const [quantity, setQuantity] = useState(1);
  const [condition, setCondition] = useState("NM");
  const [location, setLocation] = useState("");
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [error, setError] = useState<string>();

  // Autocomplete as you type (debounced).
  useEffect(() => {
    if (name || query.trim().length < 2) {
      setSuggestions([]);
      return;
    }
    const t = setTimeout(async () => {
      const res = await fetch(`/api/cards/search?q=${encodeURIComponent(query)}`);
      if (res.ok) setSuggestions((await res.json()).cards);
    }, 150);
    return () => clearTimeout(t);
  }, [query, name]);

  // Load printings when a card is chosen.
  useEffect(() => {
    if (!name) return;
    (async () => {
      const res = await fetch(`/api/cards/lookup?name=${encodeURIComponent(name)}`);
      const list: Printing[] = res.ok ? (await res.json()).printings : [];
      setPrintings(list);
      setPrintingId(list[0]?.id);
      setFinish(list[0]?.finishes[0] ?? "nonfoil");
    })();
  }, [name]);

  const printing = printings.find((p) => p.id === printingId);

  async function add() {
    if (!printing) return;
    setBusy(true);
    setError(undefined);
    const res = await fetch("/api/collection/items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source: "manual",
        cards: [{ scryfallId: printing.id, quantity, finish, condition, location: location || undefined, lang: printing.lang }],
      }),
    });
    setBusy(false);
    if (!res.ok) return setError("Couldn't add that card.");
    setLog((l) => [`Added ${quantity}× ${printing.name} (${printing.setCode.toUpperCase()} #${printing.collectorNumber}${finish !== "nonfoil" ? `, ${finish}` : ""})`, ...l]);
    setQuantity(1);
    if (!lockedName) {
      setName(undefined);
      setQuery("");
      setPrintings([]);
    }
    router.refresh();
  }

  const input = "h-11 min-w-0 rounded-md border border-line bg-background px-2 text-sm";

  return (
    <Panel className="space-y-3">
      {!lockedName && (
        <div className="relative">
          <label className="flex flex-col text-xs text-muted">
            Card name
            <input
              autoFocus
              className={`${input} text-foreground`}
              value={query}
              placeholder="Start typing, e.g. Sol Ring"
              onChange={(e) => {
                setQuery(e.target.value);
                setName(undefined);
              }}
            />
          </label>
          {suggestions.length > 0 && !name && (
            <ul className="absolute z-10 mt-1 max-h-72 w-full overflow-auto rounded-md border border-line bg-panel shadow-lg">
              {suggestions.map((s) => (
                <li key={s.oracleId}>
                  <button
                    className="block w-full px-3 py-2 text-left text-sm hover:bg-background"
                    onClick={() => {
                      setName(s.name);
                      setQuery(s.name);
                      setSuggestions([]);
                    }}
                  >
                    {s.name} <span className="text-xs text-muted">{s.typeLine}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {name && printings.length > 0 && (
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex w-full min-w-0 flex-col text-xs text-muted sm:w-auto sm:min-w-56 sm:flex-1">
            Printing
            <select
              className={`${input} text-foreground`}
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
          <label className="flex flex-col text-xs text-muted">
            Finish
            <select className={`${input} text-foreground`} value={finish} onChange={(e) => setFinish(e.target.value)}>
              {(printing?.finishes ?? ["nonfoil"]).map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col text-xs text-muted">
            Condition
            <select className={`${input} text-foreground`} value={condition} onChange={(e) => setCondition(e.target.value)}>
              {CONDITIONS.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col text-xs text-muted">
            Copies
            <input
              type="number"
              min={1}
              max={1000}
              className={`${input} w-20 text-foreground`}
              value={quantity}
              onChange={(e) => setQuantity(Math.max(1, Number(e.target.value) || 1))}
            />
          </label>
          <label className="flex flex-col text-xs text-muted">
            Location
            <input
              className={`${input} w-full text-foreground sm:w-36`}
              placeholder="Binder, box…"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
            />
          </label>
          <Button className="h-11" onClick={add} disabled={busy || !printing}>
            {busy ? "Adding…" : "Add"}
          </Button>
        </div>
      )}
      {name && printings.length === 0 && <p className="text-sm text-muted">Loading printings…</p>}
      {error && <p className="text-sm text-danger">{error}</p>}
      {log.length > 0 && (
        <ul className="space-y-1 text-sm text-ok">
          {log.map((l, i) => (
            <li key={i}>✓ {l}</li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
