import { SynergyView } from "@/components/deck/SynergyView";
import { getDb } from "@/db/client";
import { synergyReport } from "@/lib/deck/synergy-data";
import { getPriceView } from "@/lib/settings";
import { analysisInputs, loadDeck } from "../data";

/** The deck's synergy check: its score, mechanics, card ranking and cards to add (Brayden, 2026-11-18). */
export default async function DeckSynergy({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const v = await loadDeck(id);
  const [inputs, pv] = await Promise.all([analysisInputs(v), getPriceView()]);
  const report = await synergyReport(await getDb(), v, inputs.combos);
  return <SynergyView deckId={v.deck.id} report={report} commander={v.commanders.map((c) => c.name.split(",")[0]).join(" + ")} pv={pv} />;
}
