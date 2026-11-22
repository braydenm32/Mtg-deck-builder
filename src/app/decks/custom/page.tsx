import { getDb } from "@/db/client";
import { CustomCards } from "@/components/cards/CustomCards";
import { DeckToast } from "@/components/deck/DeckRowActions";
import { listCustomCards } from "@/lib/cards/custom";

export const dynamic = "force-dynamic";

/** Cards you made up: playtest cards, spoilers, house cards (src/lib/cards/custom.ts). */
export default async function CustomCardsPage() {
  const cards = await listCustomCards(await getDb());
  return (
    <div className="max-w-2xl space-y-3">
      <p className="px-1 text-sm text-muted">Playtest cards, cards that are spoiled but not out yet, or house cards. Decks treat them like any other card.</p>
      <CustomCards cards={cards} />
      <DeckToast />
    </div>
  );
}
