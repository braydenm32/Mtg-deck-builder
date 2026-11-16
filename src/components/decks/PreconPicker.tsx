"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { showDeckToast } from "@/components/deck/DeckRowActions";
import { Sheet } from "@/components/deck/Sheet";
import type { Place } from "@/lib/collection/locations";
import type { PreconSummary } from "@/lib/deck/precons";

/**
 * Pick an official Commander precon and import it: as a deck you own (its cards go into your
 * collection in their exact printings, and the deck is Built) or as an idea to see what you'd need.
 * Then the Upgrades tab finds swaps from your collection.
 */
export function PreconPicker({ places }: { places: Place[] }) {
  const router = useRouter();
  const [list, setList] = useState<PreconSummary[]>();
  const [error, setError] = useState<string>();
  const [q, setQ] = useState("");
  const [pick, setPick] = useState<PreconSummary>();
  const [owned, setOwned] = useState(true);
  const [location, setLocation] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/precons")
      .then(async (res) => {
        const body = await res.json();
        if (res.ok) setList(body.precons);
        else setError(body.error);
      })
      .catch(() => setError("The precon list needs a connection."));
  }, []);

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (list ?? []).filter((p) => !t || p.name.toLowerCase().includes(t) || p.code.toLowerCase() === t);
  }, [list, q]);

  async function importIt() {
    if (!pick) return;
    setBusy(true);
    const res = await fetch("/api/precons", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fileName: pick.fileName, owned, location: owned ? location : undefined }),
    }).catch(() => undefined);
    const body = res ? await res.json().catch(() => ({})) : {};
    setBusy(false);
    if (!res?.ok) return showDeckToast({ message: body.error ?? "That didn’t import. Try again.", error: true });
    showDeckToast({
      message: owned
        ? `Imported ${body.name}: ${body.copies} cards added to your collection. Find swaps from your collection here.`
        : `Imported ${body.name} as an idea. Find swaps from your collection here.`,
    });
    router.push(`/decks/${body.deckId}/suggestions`);
  }

  if (error) return <p className="rounded-2xl border border-line bg-panel p-4 text-sm text-muted">{error}</p>;
  return (
    <div className="space-y-3">
      <input
        className="h-11 w-full rounded-xl border border-line bg-panel px-3 text-base"
        placeholder="Search precons by name or set code…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        aria-label="Search precons"
      />
      {!list ? (
        <p className="text-sm text-muted">Getting the precon list…</p>
      ) : shown.length === 0 ? (
        <p className="text-sm text-muted">No precon matches “{q}”.</p>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-panel" aria-label="Commander precons">
          {shown.slice(0, 120).map((p) => (
            <li key={p.fileName}>
              <button type="button" className="flex min-h-14 w-full items-center justify-between gap-3 px-4 py-2 text-left hover:bg-(--panel-2)" onClick={() => setPick(p)}>
                <span className="min-w-0">
                  <span className="block truncate font-medium">{p.name}</span>
                  <span className="block text-[13px] text-muted tabular-nums">
                    {p.code} · {p.releaseDate.slice(0, 4)}
                  </span>
                </span>
                <span aria-hidden className="text-muted">
                  ›
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {pick && (
        <Sheet title={pick.name} sub={`${pick.code} · released ${pick.releaseDate}`} onClose={() => setPick(undefined)}>
          <div className="space-y-3 px-3 pb-2 text-sm">
            <label className="flex min-h-12 cursor-pointer items-start gap-3 rounded-xl border border-line p-3">
              <input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0" checked={owned} onChange={(e) => setOwned(e.target.checked)} />
              <span>
                <span className="block font-medium">I own this precon</span>
                <span className="block text-muted">Its cards go into your collection in their exact printings, and the deck holds them. Otherwise it’s an idea showing what you’d need.</span>
              </span>
            </label>
            {owned && (
              <label className="block space-y-1">
                <span className="block font-medium">Where the cards live (optional)</span>
                <input
                  className="h-11 w-full rounded-xl border border-line bg-background px-3 text-base"
                  value={location}
                  list="precon-places"
                  placeholder="Deck box, binder…"
                  onChange={(e) => setLocation(e.target.value)}
                />
                <datalist id="precon-places">
                  {places.map((p) => (
                    <option key={p.location} value={p.location} />
                  ))}
                </datalist>
              </label>
            )}
            <button
              type="button"
              className="inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-accent px-4 font-semibold text-accent-fg disabled:opacity-50"
              disabled={busy}
              onClick={() => void importIt()}
            >
              {busy ? "Importing…" : "Import"}
            </button>
          </div>
        </Sheet>
      )}
    </div>
  );
}
