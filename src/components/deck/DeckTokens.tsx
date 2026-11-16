"use client";

import Image from "next/image";
import { useState } from "react";
import type { DeckTokens as Tokens } from "@/lib/deck/tokens";

/**
 * The tokens and emblems the deck makes, with a picture of each and the cards that make them, so
 * you can find or print them before a game. Loaded when opened (it needs a connection).
 */
export function DeckTokens({ deckId }: { deckId: number }) {
  const [data, setData] = useState<Tokens>();
  const [failed, setFailed] = useState(false);

  async function load() {
    if (data) return;
    setFailed(false);
    const res = await fetch(`/api/decks/${deckId}/tokens`).catch(() => undefined);
    if (res?.ok) setData(await res.json());
    else setFailed(true);
  }

  const n = data?.tokens.length;
  return (
    <details className="group min-w-0 rounded-2xl border border-line bg-panel" onToggle={(e) => (e.currentTarget as HTMLDetailsElement).open && void load()}>
      <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-2 px-4">
        <h2 className="text-lg font-semibold">Tokens{n ? ` (${n})` : ""}</h2>
        <span className="text-sm text-accent group-open:hidden">Show</span>
      </summary>
      <div className="space-y-3 px-4 pb-4 text-sm">
        {failed ? (
          <p className="text-muted">
            Tokens need a connection.{" "}
            <button type="button" className="font-medium text-accent" onClick={() => void load()}>
              Try again
            </button>
          </p>
        ) : !data ? (
          <p className="text-muted">Finding tokens…</p>
        ) : (
          <>
            {data.tokens.length === 0 && <p className="text-muted">{data.unknown ? "None found yet." : "This deck makes no tokens."}</p>}
            {data.tokens.length > 0 && (
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {data.tokens.map((t) => (
                  <li key={t.id} className="min-w-0">
                    <a href={`https://scryfall.com/card/${t.id}`} target="_blank" rel="noreferrer" className="block">
                      <span className="relative block aspect-[488/680] overflow-hidden rounded-lg bg-skeleton">
                        {(t.imageNormal ?? t.imageSmall) && <Image src={(t.imageNormal ?? t.imageSmall)!} alt={t.name} fill sizes="(min-width: 640px) 180px, 45vw" className="object-cover" />}
                        {!t.imageNormal && !t.imageSmall && <span className="absolute inset-0 grid place-items-center p-2 text-center font-medium">{t.name}</span>}
                      </span>
                    </a>
                    <span className="mt-1 block truncate font-medium">{t.name}</span>
                    <span className="block text-[13px] text-muted">
                      {t.makers.length === 1 ? `From ${t.makers[0]}` : `From ${t.makers.length} cards`}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {data.unknown > 0 && (
              <p className="text-[13px] text-muted">
                {data.unknown} {data.unknown === 1 ? "card hasn’t" : "cards haven’t"} been checked for tokens: Scryfall couldn’t be reached. Open this again later.
              </p>
            )}
          </>
        )}
      </div>
    </details>
  );
}
