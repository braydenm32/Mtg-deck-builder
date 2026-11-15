import Link from "next/link";
import type { DeckRow } from "@/app/decks/[id]/data";
import { DeckCardControls } from "./DeckCardControls";
import { Badge, ManaCost, money } from "./ui";

export function StateBadge({ c }: { c: DeckRow }) {
  switch (c.state) {
    case "placed":
      return c.basic ? null : <Badge tone="ok">{c.location ? c.location : "Owned"}</Badge>;
    case "free":
      return <Badge tone="accent">Free copy</Badge>;
    case "shared":
      return <Badge tone="warn">Shared</Badge>;
    case "other-deck":
      return <Badge tone="warn">In {c.inDecks.map((d) => d.name).join(", ") || "another deck"}</Badge>;
    case "not-owned":
      return <Badge tone="danger">{c.acquire === "proxy" ? "Proxy" : "Buy"}</Badge>;
    default:
      return <Badge>No card data</Badge>;
  }
}

/** A list of deck cards with their state, why they're here, and controls. */
export function DeckCardList({ deckId, rows, showPrice = false }: { deckId: number; rows: DeckRow[]; showPrice?: boolean }) {
  return (
    <ul className="divide-y divide-line rounded-lg border border-line bg-panel">
      {rows.map((c) => (
        <li key={c.id} className="flex min-w-0 items-center gap-2 px-3 py-1.5">
          <div className="min-w-0 flex-1 py-1">
            <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
              <span className="text-sm">
                {c.quantity > 1 && <span className="text-muted">{c.quantity}× </span>}
                {c.ownedReal > 0 ? (
                  <Link className="hover:underline" href={`/collection/${c.oracleId}`}>
                    {c.name}
                  </Link>
                ) : (
                  c.name
                )}
              </span>
              <ManaCost cost={c.manaCost} />
              <StateBadge c={c} />
              {c.gameChanger && <Badge tone="warn">Game Changer</Badge>}
              {showPrice && c.priceUsd != null && <span className="text-xs text-muted">{money(c.priceUsd)}</span>}
            </div>
            {c.reason && !c.basic && <p className="truncate text-xs text-muted">{c.reason}</p>}
          </div>
          {!c.basic && <DeckCardControls deckId={deckId} row={c} />}
        </li>
      ))}
    </ul>
  );
}
