"use client";

import { useEffect, useState } from "react";
import { cardIndex, refreshCardIndex, searchCardIndex, type IndexCard } from "@/lib/offline/card-index";
import { editsWait, queueDeckEdit } from "@/lib/offline/outbox";

type Hit = { oracleId: string; name: string; typeLine: string };

/**
 * Search cards in the deck's colours and add one (it's locked, so rebuilding keeps it). With the card
 * list on this device (src/lib/offline/card-index.ts) the search answers as you type and works
 * offline; until it's there, the server answers. The add goes through the device's outbox, so it
 * shows at once and waits on the device when offline.
 */
export function DeckAddCard({ deckId, identity }: { deckId: number; identity: string }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [msg, setMsg] = useState<string>();
  const [index, setIndex] = useState<IndexCard[] | null>(null);

  // Open the device's card list when you start searching, and fetch it if it isn't here yet.
  function ready() {
    if (index) return;
    void cardIndex().then((cards) => (cards ? setIndex(cards) : refreshCardIndex().then(() => cardIndex().then(setIndex))));
  }

  useEffect(() => {
    if (q.trim().length < 2) return setHits([]);
    if (index) return setHits(searchCardIndex(index, q, { identity: identity.toUpperCase().replace(/[^WUBRG]/g, "") }));
    const t = setTimeout(async () => {
      const res = await fetch(`/api/cards/search?q=${encodeURIComponent(q)}&identity=${identity || "C"}`).catch(() => undefined);
      if (res?.ok) setHits((await res.json()).cards);
      else if (!res) setMsg("Searching needs a connection until this device has the card list. Add cards from the Upgrades tab for now.");
    }, 150);
    return () => clearTimeout(t);
  }, [q, identity, index]);

  function add(h: Hit) {
    queueDeckEdit({ kind: "add", deckId, oracleId: h.oracleId, name: h.name, board: "main" });
    setMsg(editsWait() ? `Added ${h.name}. Saved on this device until it can be sent.` : `Added ${h.name}`);
    setQ("");
    setHits([]);
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
        onFocus={ready}
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
