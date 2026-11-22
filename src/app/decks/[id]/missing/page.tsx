import { getPriceView } from "@/lib/settings";
import { MissingView } from "@/components/deck/MissingView";
import { loadDeck } from "../data";

export default async function DeckMissing({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [v, pv] = await Promise.all([loadDeck(id), getPriceView()]);
  return <MissingView v={v} pv={pv} />;
}
