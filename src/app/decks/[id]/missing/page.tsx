import Link from "next/link";
import { DeckCardList } from "@/components/DeckCardList";
import { DeckUndoBar } from "@/components/DeckCardControls";
import { money, Panel } from "@/components/ui";
import { SLOT_LABEL, type SlotState } from "@/lib/deck/store";
import { getPriceView } from "@/lib/settings";
import { MissingView } from "@/components/deck/MissingView";
import { currentLook } from "@/lib/look";
import { loadDeck } from "../data";

const ORDER: { state: SlotState; help: string }[] = [
  { state: "free", help: "You have a spare copy. Rebuild or set the deck to Building to place it." },
  { state: "shared", help: "Free right now, but more decks want it than you own copies of." },
  { state: "other-deck", help: "Every copy you own is in another deck." },
  { state: "not-owned", help: "Not in your collection. Buy or proxy it, or remove it and rebuild." },
  { state: "no-data", help: "We don't have card data for these." },
];

export default async function DeckMissing({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [v, pv] = await Promise.all([loadDeck(id), getPriceView()]);
  if ((await currentLook()) === "new") return <MissingView v={v} pv={pv} />;
  const open = v.cards.filter((c) => c.board === "main" && c.state !== "placed");
  const wanted = v.cards.filter((c) => c.board === "wanted");
  if (!open.length && !wanted.length) {
    return <Panel className="text-sm">Every card in this deck is in your hands. Nothing missing.</Panel>;
  }
  return (
    <div className="space-y-4">
      {v.costToFinish > 0 && (
        <p className="text-sm text-muted">
          {pv.hide ? "Cards you don’t own are listed below." : `About ${money(v.costToFinish, pv)} to finish (cheapest printings of the cards you don’t own).`}{" "}
          <a className="text-accent underline" href={`/api/decks/${v.deck.id}/export?format=missing&download=1`}>
            Download the list
          </a>
        </p>
      )}
      {ORDER.map(({ state, help }) => {
        const rows = open.filter((c) => c.state === state);
        if (!rows.length) return null;
        return (
          <section key={state} className="space-y-1">
            <h2 className="text-sm font-semibold">
              {SLOT_LABEL[state]} <span className="font-normal text-muted">{rows.reduce((n, c) => n + c.quantity, 0)}</span>
            </h2>
            <p className="text-xs text-muted">{help}</p>
            <DeckCardList deckId={v.deck.id} rows={rows} prices={state === "not-owned" ? pv : undefined} />
          </section>
        );
      })}
      {wanted.length > 0 && (
        <section className="space-y-1">
          <h2 className="text-sm font-semibold">
            Wanted, but in another deck <span className="font-normal text-muted">{wanted.length}</span>
          </h2>
          <p className="text-xs text-muted">
            These would make this deck, but your copies are used elsewhere.{" "}
            <Link className="text-accent underline" href="/decks/shared">
              Decide where shared cards go
            </Link>
          </p>
          <DeckCardList deckId={v.deck.id} rows={wanted} />
        </section>
      )}
      <DeckUndoBar deckId={v.deck.id} />
    </div>
  );
}
