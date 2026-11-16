import { DeckToast } from "@/components/deck/DeckRowActions";
import { LifeCounter } from "@/components/deck/LifeCounter";
import { loadDeck } from "../data";

/** Life counter for a game with this deck, which logs the game to the deck when it's over. */
export default async function DeckPlay({ params }: { params: Promise<{ id: string }> }) {
  const v = await loadDeck((await params).id);
  return (
    <div className="space-y-3">
      <LifeCounter deckId={v.deck.id} commander={v.commanders.map((c) => c.name).join(" + ") || v.deck.name} />
      <DeckToast />
    </div>
  );
}
