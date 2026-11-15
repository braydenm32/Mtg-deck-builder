import Link from "next/link";
import type { LoadedDeck } from "@/app/decks/[id]/data";
import type { PriceView } from "@/lib/money";
import { DeckToast } from "./DeckRowActions";
import { DeckRows, RowGroup } from "./DeckRows";

/**
 * The deck's Upgrades tab in the new look, owned first: cards the builder suggests that you now have a
 * free copy of, then the ones that would make this deck but sit in your other decks, then the cards to
 * buy or proxy, shown last and quietly (Brayden's answer 6). The lists are the builder's, as the old
 * tab shows them; this only orders them by where the card is.
 */
export function UpgradesView({ v, pv }: { v: LoadedDeck; pv: PriceView }) {
  // The builder's upgrades and the cards it wanted from your other decks, best first (the old tab's order).
  const all = v.cards.filter((c) => c.board === "upgrade" || c.board === "wanted").sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  const free = all.filter((c) => c.state === "free" || c.state === "shared");
  const toGet = all.filter((c) => c.state === "not-owned" || c.state === "no-data");
  const elsewhere = all.filter((c) => !free.includes(c) && !toGet.includes(c));
  if (!all.length) {
    return (
      <div className="rounded-2xl border border-line bg-panel p-4">
        <p className="font-semibold">No upgrades to suggest</p>
        <p className="text-sm text-muted">Your own cards are already the strongest picks the builder found. Rebuilding the deck refreshes this list.</p>
        <Link className="mt-2 inline-flex min-h-11 items-center rounded-xl border border-line px-4 text-sm font-medium hover:bg-background" href={`/decks/${v.deck.id}#settings`}>
          Rebuild in Deck settings
        </Link>
      </div>
    );
  }
  const owned = free.length > 0 || elsewhere.length > 0;
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">Cards that would beat your weakest picks. Adding one locks it in; rebuild to make room.</p>
      <div className={`grid min-w-0 gap-6 ${owned && toGet.length ? "min-[900px]:grid-cols-2 min-[900px]:items-start" : ""}`}>
        {owned && (
          <div className="min-w-0 space-y-6">
            {free.length > 0 && (
              <RowGroup title="Free in your collection" count={free.length}>
                <DeckRows deckId={v.deck.id} rows={free} thumbs chip={false} />
              </RowGroup>
            )}
            {elsewhere.length > 0 && (
              <RowGroup
                title="In your other decks"
                count={elsewhere.length}
                help="Every copy you own is in another deck."
                aside={
                  <Link className="inline-flex min-h-11 items-center text-sm font-medium text-accent" href="/decks/shared">
                    Shared cards
                  </Link>
                }
              >
                <DeckRows deckId={v.deck.id} rows={elsewhere} thumbs />
              </RowGroup>
            )}
          </div>
        )}
        {toGet.length > 0 && (
          <div className="min-w-0">
            <RowGroup title="To buy or proxy" count={toGet.length} help={pv.hide ? undefined : "Cheapest printing for each."}>
              <DeckRows deckId={v.deck.id} rows={toGet} prices={pv} thumbs chip={false} />
            </RowGroup>
          </div>
        )}
      </div>
      <DeckToast />
    </div>
  );
}
