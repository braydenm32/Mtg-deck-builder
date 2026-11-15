"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button, ColorPips } from "./ui";

export type CommanderOption = { oracleId: string; name: string; colorIdentity: string };
type Theme = { slug: string; label: string; count?: number };

export function NewDeckForm({ owned, initial }: { owned: CommanderOption[]; initial?: { commander?: CommanderOption; theme?: string } }) {
  const router = useRouter();
  const [commander, setCommander] = useState<CommanderOption | undefined>(initial?.commander);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<CommanderOption[]>([]);
  const [themes, setThemes] = useState<Theme[]>([]);
  const [theme, setTheme] = useState(initial?.theme ?? "");
  const [buy, setBuy] = useState(true);
  const [status, setStatus] = useState<"building" | "idea">("idea");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (commander || q.trim().length < 2) return setHits([]);
    const t = setTimeout(async () => {
      const res = await fetch(`/api/cards/search?commander=1&q=${encodeURIComponent(q)}`);
      if (res.ok) setHits((await res.json()).cards);
    }, 150);
    return () => clearTimeout(t);
  }, [q, commander]);

  useEffect(() => {
    if (!commander) return setThemes([]);
    let live = true;
    (async () => {
      const res = await fetch(`/api/decks/themes?commander=${commander.oracleId}`);
      if (res.ok && live) setThemes((await res.json()).themes);
    })();
    return () => {
      live = false;
    };
  }, [commander]);

  const ownedFiltered = owned.filter((o) => !q || o.name.toLowerCase().includes(q.toLowerCase())).slice(0, 24);

  async function build() {
    if (!commander) return;
    setBusy(true);
    setError(undefined);
    const res = await fetch("/api/decks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ commanderOracleId: commander.oracleId, theme: theme || null, status, settings: { suggestUnowned: buy } }),
    });
    if (!res.ok) {
      setBusy(false);
      return setError("Couldn't build that deck. Try again.");
    }
    const { id } = await res.json();
    router.push(`/decks/${id}`);
  }

  const themed = themes.filter((t) => t.count);
  const builtIn = themes.filter((t) => !t.count);

  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <h2 className="font-semibold">1. Commander</h2>
        {commander ? (
          <div className="flex min-h-11 items-center justify-between gap-3 rounded-md border border-accent px-3">
            <span className="flex min-w-0 items-center gap-2">
              <span className="truncate">{commander.name}</span>
              <ColorPips identity={commander.colorIdentity} />
            </span>
            <button className="inline-flex min-h-11 items-center text-sm text-muted" onClick={() => { setCommander(undefined); setTheme(""); }}>
              Change
            </button>
          </div>
        ) : (
          <>
            <input className="h-11 w-full rounded-md border border-line bg-panel px-3" placeholder="Search for a commander…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Commander" autoFocus />
            {ownedFiltered.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs text-muted">Commanders you own</p>
                <ul className="flex flex-wrap gap-2">
                  {ownedFiltered.map((o) => (
                    <li key={o.oracleId}>
                      <button className="inline-flex min-h-11 items-center gap-2 rounded-md border border-line px-3 text-sm hover:border-accent" onClick={() => setCommander(o)}>
                        {o.name} <ColorPips identity={o.colorIdentity} />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {hits.length > 0 && (
              <ul className="divide-y divide-line rounded-md border border-line bg-panel">
                {hits.map((h) => (
                  <li key={h.oracleId}>
                    <button className="flex min-h-11 w-full items-center justify-between gap-2 px-3 text-left text-sm hover:bg-background" onClick={() => setCommander(h)}>
                      <span>{h.name}</span>
                      <ColorPips identity={h.colorIdentity} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </section>

      {commander && (
        <section className="space-y-2">
          <h2 className="font-semibold">2. Theme</h2>
          <select className="h-11 w-full rounded-md border border-line bg-panel px-3" value={theme} onChange={(e) => setTheme(e.target.value)} aria-label="Theme">
            <option value="">No theme: the strongest cards for this commander</option>
            {themed.length > 0 && (
              <optgroup label="Popular for this commander (EDHREC decks)">
                {themed.map((t) => (
                  <option key={t.slug} value={t.slug}>
                    {t.label} ({t.count?.toLocaleString("en-US")})
                  </option>
                ))}
              </optgroup>
            )}
            <optgroup label="Other themes">
              {builtIn.map((t) => (
                <option key={t.slug} value={t.slug}>
                  {t.label}
                </option>
              ))}
            </optgroup>
          </select>
        </section>
      )}

      {commander && (
        <section className="space-y-2">
          <h2 className="font-semibold">3. Options</h2>
          <label className="flex min-h-11 items-center gap-3 text-sm">
            <input type="checkbox" className="h-5 w-5" checked={buy} onChange={(e) => setBuy(e.target.checked)} />
            Suggest cards to buy or proxy when my collection is short
          </label>
          <label className="flex min-h-11 items-center gap-3 text-sm">
            <input type="checkbox" className="h-5 w-5" checked={status === "building"} onChange={(e) => setStatus(e.target.checked ? "building" : "idea")} />
            Start building now (hold my copies for this deck). Otherwise it’s saved as an idea.
          </label>
        </section>
      )}

      <Button className="min-h-11 w-full sm:w-auto" disabled={!commander || busy} onClick={build}>
        {busy ? "Building… (a few seconds)" : "Build deck"}
      </Button>
      {error && <p className="text-sm text-danger" role="alert">{error}</p>}
    </div>
  );
}
