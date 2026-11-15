import { DeckCardList } from "@/components/DeckCardList";
import { Panel } from "@/components/ui";
import { getPriceView } from "@/lib/settings";
import { UpgradesView } from "@/components/deck/UpgradesView";
import { currentLook } from "@/lib/look";
import { loadDeck } from "../data";

export default async function DeckUpgrades({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [v, pv] = await Promise.all([loadDeck(id), getPriceView()]);
  if ((await currentLook()) === "new") return <UpgradesView v={v} pv={pv} />;
  const upgrades = v.cards.filter((c) => c.board === "upgrade").sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  if (!upgrades.length) {
    return <Panel className="text-sm">No upgrades to suggest: your own cards are already the strongest picks the builder found.</Panel>;
  }
  return (
    <div className="space-y-2">
      <p className="text-sm text-muted">Cards you don’t own that would beat your weakest picks. Adding one locks it in; rebuild to make room.</p>
      <DeckCardList deckId={v.deck.id} rows={upgrades} prices={pv} />
    </div>
  );
}
