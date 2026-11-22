import { getPriceView } from "@/lib/settings";
import { UpgradesView } from "@/components/deck/UpgradesView";
import { loadDeck } from "../data";

export default async function DeckUpgrades({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [v, pv] = await Promise.all([loadDeck(id), getPriceView()]);
  return <UpgradesView v={v} pv={pv} />;
}
