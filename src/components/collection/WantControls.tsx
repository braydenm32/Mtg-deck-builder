"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { showDeckToast } from "@/components/deck/DeckRowActions";
import {
  cardIndex,
  refreshCardIndex,
  searchCardIndex,
  type IndexCard,
} from "@/lib/offline/card-index";

type Hit = { oracleId: string; name: string; typeLine: string };

const post = (method: "POST" | "DELETE", body: unknown) =>
  fetch("/api/wants", {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).catch(() => undefined);

/**
 * Add a card to the want list yourself (one no deck asks for yet). Searches the card list on this
 * device as you type when it's there, otherwise asks the server; adding needs a connection.
 */
export function WantAddCard() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [index, setIndex] = useState<IndexCard[] | null>(null);

  function ready() {
    if (index) return;
    void cardIndex().then((cards) =>
      cards
        ? setIndex(cards)
        : refreshCardIndex().then(() => cardIndex().then(setIndex)),
    );
  }

  useEffect(() => {
    if (q.trim().length < 2) return setHits([]);
    if (index) return setHits(searchCardIndex(index, q));
    const t = setTimeout(async () => {
      const res = await fetch(
        `/api/cards/search?q=${encodeURIComponent(q)}`,
      ).catch(() => undefined);
      if (res?.ok) setHits((await res.json()).cards);
    }, 150);
    return () => clearTimeout(t);
  }, [q, index]);

  async function add(h: Hit) {
    setQ("");
    setHits([]);
    const res = await post("POST", { oracleId: h.oracleId });
    if (!res?.ok)
      return showDeckToast({
        message: "That didn’t save. Adding needs a connection.",
        error: true,
      });
    const { quantity } = (await res.json()) as { quantity: number };
    showDeckToast({
      message:
        quantity > 1 ? `${h.name}: you want ${quantity}` : `Added ${h.name}`,
    });
    router.refresh();
  }

  return (
    <div className="relative">
      <input
        className="h-11 w-full rounded-xl border border-line bg-panel px-3 text-base"
        placeholder="Add a card you want…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onFocus={ready}
        aria-label="Add a card you want"
      />
      {hits.length > 0 && (
        <ul className="absolute inset-x-0 top-12 z-10 max-h-72 overflow-auto rounded-xl border border-line bg-panel shadow-lg">
          {hits.map((h) => (
            <li key={h.oracleId}>
              <button
                type="button"
                className="flex min-h-11 w-full flex-col items-start px-3 py-1 text-left hover:bg-(--panel-2)"
                onClick={() => void add(h)}
              >
                <span className="text-sm">{h.name}</span>
                <span className="text-xs text-muted">{h.typeLine}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Take a card you added off the list, with Undo. */
export function WantRemove({
  oracleId,
  name,
  quantity,
}: {
  oracleId: string;
  name: string;
  quantity: number;
}) {
  const router = useRouter();
  async function remove() {
    const res = await post("DELETE", { oracleId });
    if (!res?.ok)
      return showDeckToast({
        message: "That didn’t save. Try again.",
        error: true,
      });
    showDeckToast({
      message: `Took ${name} off your list`,
      undo: async () => (await post("POST", { oracleId, quantity })) ?? false,
    });
    router.refresh();
  }
  return (
    <button
      type="button"
      className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted hover:text-foreground"
      aria-label={`Take ${name} off your list`}
      onClick={() => void remove()}
    >
      <svg
        viewBox="0 0 24 24"
        width="18"
        height="18"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        aria-hidden
      >
        <path d="M6 6l12 12M18 6L6 18" />
      </svg>
    </button>
  );
}
