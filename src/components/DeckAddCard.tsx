"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type Hit = { oracleId: string; name: string; typeLine: string };

/** Search cards in the deck's colours and add one (it's locked, so rebuilding keeps it). */
export function DeckAddCard({ deckId, identity }: { deckId: number; identity: string }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [msg, setMsg] = useState<string>();

  useEffect(() => {
    if (q.trim().length < 2) return setHits([]);
    const t = setTimeout(async () => {
      const res = await fetch(`/api/cards/search?q=${encodeURIComponent(q)}&identity=${identity || "C"}`);
      if (res.ok) setHits((await res.json()).cards);
    }, 150);
    return () => clearTimeout(t);
  }, [q, identity]);

  async function add(h: Hit) {
    const res = await fetch(`/api/decks/${deckId}/cards`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ oracleId: h.oracleId }) });
    setMsg(res.ok ? `Added ${h.name}` : `Couldn't add ${h.name}`);
    setQ("");
    setHits([]);
    router.refresh();
  }

  return (
    <div className="relative">
      <input
        className="h-11 w-full rounded-md border border-line bg-panel px-3"
        placeholder="Add a card to this deck…"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setMsg(undefined);
        }}
        aria-label="Add a card"
      />
      {hits.length > 0 && (
        <ul className="absolute inset-x-0 top-12 z-10 max-h-72 overflow-auto rounded-md border border-line bg-panel shadow-lg">
          {hits.map((h) => (
            <li key={h.oracleId}>
              <button className="flex min-h-11 w-full flex-col items-start px-3 py-1 text-left hover:bg-background" onClick={() => add(h)}>
                <span className="text-sm">{h.name}</span>
                <span className="text-xs text-muted">{h.typeLine}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {msg && <p className="mt-1 text-xs text-muted" role="status">{msg}</p>}
    </div>
  );
}
