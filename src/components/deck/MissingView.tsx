import Link from "next/link";
import type { LoadedDeck } from "@/app/decks/[id]/data";
import { money } from "@/components/ui";
import type { PriceView } from "@/lib/money";
import { DeckToast } from "./DeckRowActions";
import { DeckRows, RowGroup } from "./DeckRows";
import { OPEN_LABEL, OPEN_ORDER, type OpenState } from "./slots";

const HELP: Record<OpenState, string> = {
  free: "You have a spare copy. Rebuild or set the deck to Building to place it.",
  shared: "Free right now, but more decks want it than you own copies of.",
  "other-deck": "Every copy you own is in another deck.",
  "not-owned": "Not in your collection. Buy or proxy it, or remove it and rebuild.",
  "no-data": "We don't have card data for these.",
};

/**
 * The deck's Missing tab in the new look: the open slots in the 100, owned first. Free copies you
 * have, then shared cards, then cards in your other decks, then what you'd buy or proxy, with the
 * cost to finish (R13) when prices are on.
 */
export function MissingView({ v, pv }: { v: LoadedDeck; pv: PriceView }) {
  // The commander's own copy first, then the 99.
  const open = [...v.commanderSlots, ...v.cards.filter((c) => c.board === "main")].filter((c) => c.state !== "placed");
  const wanted = v.cards.filter((c) => c.board === "wanted").length;
  const base = `/decks/${v.deck.id}`;
  const wantedNote =
    wanted > 0 ? (
      <div className="flex flex-wrap items-center justify-between gap-x-3">
        <p className="text-sm text-muted">
          {wanted} more {wanted === 1 ? "card" : "cards"} would fit but {wanted === 1 ? "is" : "are"} in your other decks.
        </p>
        <Link className="inline-flex min-h-11 items-center text-sm font-medium text-accent" href={`${base}/suggestions`}>
          See them in Upgrades
        </Link>
      </div>
    ) : null;
  if (!open.length) {
    return (
      <div className="space-y-3">
        <div className="rounded-2xl border border-line bg-panel p-4">
          <p className="font-semibold">Nothing missing</p>
          <p className="text-sm text-muted">Every card in this deck is in your hands.</p>
        </div>
        {wantedNote}
      </div>
    );
  }
  const cost = !pv.hide && v.costToFinish > 0 ? money(v.costToFinish, pv) : null;
  return (
    <div className="space-y-6">
      {OPEN_ORDER.map((state) => {
        const rows = open.filter((c) => c.state === state);
        if (!rows.length) return null;
        const count = rows.reduce((n, c) => n + c.quantity, 0);
        return (
          <RowGroup
            key={state}
            title={OPEN_LABEL[state]}
            count={count}
            help={
              state === "not-owned" ? (
                <>
                  {cost ? `About ${cost} to finish, at the cheapest printings. ` : ""}
                  {HELP[state]}
                </>
              ) : (
                HELP[state]
              )
            }
            aside={
              state === "shared" ? (
                <Link className="inline-flex min-h-11 items-center text-sm font-medium text-accent" href="/decks/shared">
                  Decide where they go
                </Link>
              ) : state === "not-owned" ? (
                <a className="inline-flex min-h-11 items-center text-sm font-medium text-accent" href={`/api/decks/${v.deck.id}/export?format=missing&download=1`}>
                  Download the list
                </a>
              ) : undefined
            }
          >
            <DeckRows
              deckId={v.deck.id}
              rows={rows}
              prices={state === "not-owned" ? pv : undefined}
              chip={state !== "free" && state !== "shared"}
              columns
            />
          </RowGroup>
        );
      })}
      {wantedNote}
      <DeckToast />
    </div>
  );
}
