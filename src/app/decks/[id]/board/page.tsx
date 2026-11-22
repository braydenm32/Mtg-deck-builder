import { PlayBoard } from "@/components/deck/PlayBoard";
import { PlaytestEmpty } from "@/components/deck/PlaytestView";
import { deckKey } from "@/lib/deck/board";
import { isLand } from "@/lib/deck/text";
import { loadDeck } from "../data";

/** The playtest board: deal this deck and play it out by hand (components/deck/PlayBoard.tsx). */
export default async function DeckBoard({ params }: { params: Promise<{ id: string }> }) {
  const v = await loadDeck((await params).id);
  const main = v.cards.filter((c) => c.board === "main" && c.quantity > 0);
  const cards = main.map((c) => ({ name: c.name, image: c.imageNormal ?? c.imageSmall ?? null, land: isLand(c), quantity: c.quantity }));
  const commanders = v.commanders.map((c) => ({ name: c.name, image: c.imageNormal ?? c.imageSmall ?? null }));
  if (cards.reduce((n, c) => n + c.quantity, 0) < 7) return <PlaytestEmpty deckId={v.deck.id} />;
  return <PlayBoard deckId={v.deck.id} deckKey={deckKey(v.deck.id, cards, commanders)} cards={cards} commanders={commanders} />;
}
