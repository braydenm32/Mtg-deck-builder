import { CardsView } from "@/components/deck/CardsView";
import { cardGroups, groupLabel, groupOf, GROUPS } from "@/components/deck/card-groups";
import { loadDeck } from "../data";

export default async function DeckCards({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ group?: string; view?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const group = groupOf(sp.group);
  const v = await loadDeck(id);
  const sorted = cardGroups(v, group);
  return <CardsView v={v} groups={[...GROUPS]} group={group} keys={sorted} label={(k) => groupLabel(k, group)} view={sp.view === "stacks" ? "stacks" : "list"} />;
}
