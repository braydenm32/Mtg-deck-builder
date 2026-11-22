"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { SynergySuggestion, SynergySuggestions as Found } from "@/lib/deck/synergy-data";
import { formatMoney, type PriceView } from "@/lib/money";
import { Badge, Skeleton } from "../ui";
import { DeckAddButtons } from "./DeckRowActions";

/** Shown before "Show more". */
const FIRST = 5;
const panel = "min-w-0 rounded-2xl border border-line bg-panel";

/**
 * Cards to add that fit the deck's mechanics: from your collection first, then to buy or proxy, the
 * top five of each with the rest behind "Show more". Looked up after the tab has drawn, since it reads
 * your collection and EDHREC's lists (GET /api/decks/:id/synergy).
 */
export function SynergySuggestions({ deckId, pv }: { deckId: number; pv: PriceView }) {
  const [found, setFound] = useState<Found>();
  const [state, setState] = useState<"looking" | "failed" | "done">("looking");
  const [added, setAdded] = useState<Set<string>>(new Set());

  async function look() {
    setState("looking");
    const res = await fetch(`/api/decks/${deckId}/synergy`).catch(() => undefined);
    if (!res?.ok) return setState("failed");
    setFound((await res.json()) as Found);
    setState("done");
  }
  useEffect(() => {
    void look();
    // Once per deck.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deckId]);

  const onAdded = (oracleId: string) => setAdded((cur) => new Set(cur).add(oracleId));
  const owned = found?.owned.filter((s) => !added.has(s.oracleId)) ?? [];
  const toGet = found?.toGet.filter((s) => !added.has(s.oracleId)) ?? [];

  return (
    <section className={`${panel} space-y-4 p-4`} aria-labelledby="fits-h">
      <div className="space-y-1">
        <h2 id="fits-h" className="text-lg font-semibold">
          Cards that would fit
        </h2>
        <p className="text-sm text-muted">Picked for the deck’s mechanics, inside its target bracket. Adding one locks it in.</p>
      </div>
      {state === "looking" && (
        <div className="space-y-2" aria-label="Looking for cards">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      )}
      {state === "failed" && (
        <div className="space-y-2">
          <p className="text-sm text-danger">Couldn’t look just now. Check the connection and try again.</p>
          <button type="button" className="inline-flex min-h-11 items-center rounded-xl border border-line px-4 text-sm font-medium hover:bg-background" onClick={() => void look()}>
            Try again
          </button>
        </div>
      )}
      {state === "done" && found && (
        <>
          <Group title="From your collection" rows={owned} deckId={deckId} pv={pv} onAdded={onAdded} empty="None of your cards add much to these mechanics that aren’t already in the deck." />
          <Group
            title="To buy or proxy"
            rows={toGet}
            deckId={deckId}
            pv={pv}
            onAdded={onAdded}
            empty={found.edhrec ? "Nothing more to suggest from EDHREC’s lists for this commander." : "EDHREC’s lists for this commander aren’t ready yet. Open this tab again in a minute."}
            quiet
          />
        </>
      )}
    </section>
  );
}

function Group({
  title,
  rows,
  deckId,
  pv,
  onAdded,
  empty,
  quiet = false,
}: {
  title: string;
  rows: SynergySuggestion[];
  deckId: number;
  pv: PriceView;
  onAdded: (oracleId: string) => void;
  empty: string;
  quiet?: boolean;
}) {
  const [all, setAll] = useState(false);
  const shown = all ? rows : rows.slice(0, FIRST);
  return (
    <div className="space-y-2">
      <h3 className={`text-[15px] font-semibold ${quiet ? "text-muted" : ""}`}>
        {title} <span className="font-normal tabular-nums text-muted">{rows.length}</span>
      </h3>
      {rows.length === 0 ? (
        <p className="text-sm text-muted">{empty}</p>
      ) : (
        <>
          <ul className="grid gap-px overflow-hidden rounded-xl border border-line bg-line">
            {shown.map((s) => (
              <Row key={s.oracleId} s={s} deckId={deckId} pv={pv} onAdded={onAdded} />
            ))}
          </ul>
          {rows.length > FIRST && (
            <button type="button" className="inline-flex min-h-11 items-center text-sm font-medium text-accent" onClick={() => setAll((x) => !x)} aria-expanded={all}>
              {all ? "Show fewer" : `Show ${rows.length - FIRST} more`}
            </button>
          )}
        </>
      )}
    </div>
  );
}

function Row({ s, deckId, pv, onAdded }: { s: SynergySuggestion; deckId: number; pv: PriceView; onAdded: (oracleId: string) => void }) {
  const price = !s.owned && s.priceUsd != null ? formatMoney(s.priceUsd, pv) : null;
  const where = s.owned ? (s.free > 0 ? null : `In ${s.inDecks.join(", ") || "another deck"}`) : null;
  return (
    <li className="flex min-h-14 min-w-0 items-center gap-3 bg-panel py-1 pl-3 pr-1">
      <span className="relative aspect-[488/680] w-10 shrink-0 overflow-hidden rounded-[5%] bg-skeleton">
        {s.imageSmall && <Image src={s.imageSmall} alt="" fill sizes="40px" className="object-cover" />}
      </span>
      <span className="relative block min-w-0 flex-1 py-1">
        <span className="line-clamp-2 min-w-0 text-[15px] font-medium">
          {s.owned ? (
            <Link className="after:absolute after:-inset-y-2 after:inset-x-0 hover:underline" href={`/collection/${s.oracleId}`}>
              {s.name}
            </Link>
          ) : (
            s.name
          )}
        </span>
        <span className="mt-0.5 flex min-w-0 flex-wrap items-center gap-1.5 text-xs text-muted">
          <span className="font-semibold tabular-nums text-foreground" aria-label={`Fit ${s.score} out of 100`}>
            {s.score}
          </span>
          {s.mechanics.slice(0, 2).map((m) => (
            <Badge key={m} tone="accent">
              {m}
            </Badge>
          ))}
          {where && <Badge tone="warn">{where}</Badge>}
          {price && <span className="tabular-nums">{price}</span>}
        </span>
        <span className="mt-0.5 line-clamp-2 text-xs text-muted">{s.reason}</span>
        {s.replaces && (
          <span className="mt-0.5 block truncate text-xs text-muted">
            Could replace <span className="text-foreground">{s.replaces.name}</span> ({s.replaces.score})
          </span>
        )}
      </span>
      <DeckAddButtons deckId={deckId} oracleId={s.oracleId} name={s.name} onAdded={(board) => board === "main" && onAdded(s.oracleId)} />
    </li>
  );
}
