import Link from "next/link";
import { DeckAddCard } from "@/components/DeckAddCard";
import { DeckCardList } from "@/components/DeckCardList";
import { DeckUndoBar } from "@/components/DeckCardControls";
import { CardsView } from "@/components/deck/CardsView";
import { currentLook } from "@/lib/look";
import { cardGroups, groupLabel, groupOf, GROUPS } from "@/components/deck/card-groups";
import { loadDeck } from "../data";

export default async function DeckCards({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ group?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const group = groupOf(sp.group);
  const v = await loadDeck(id);
  const maybe = v.cards.filter((c) => c.board === "maybe");
  const sorted = cardGroups(v, group);
  if ((await currentLook()) === "new") {
    return <CardsView v={v} groups={[...GROUPS]} group={group} keys={sorted} label={(k) => groupLabel(k, group)} />;
  }
  return (
    <div className="space-y-4">
      <DeckAddCard deckId={v.deck.id} identity={v.deck.colorIdentity} />
      <div className="flex flex-wrap items-center gap-1 text-sm" role="group" aria-label="Group cards by">
        <span className="mr-1 text-muted">Group by</span>
        {GROUPS.map((g) => (
          <Link
            key={g.key}
            href={`?group=${g.key}`}
            aria-current={g.key === group ? "true" : undefined}
            className={`inline-flex min-h-11 items-center rounded-md px-3 ${g.key === group ? "bg-accent text-accent-fg" : "border border-line"}`}
          >
            {g.label}
          </Link>
        ))}
      </div>
      {sorted.map(([k, rows]) => {
        return (
          <section key={k} className="space-y-1">
            <h2 className="text-sm font-semibold">
              {groupLabel(k, group)} <span className="font-normal text-muted">{rows.reduce((n, c) => n + c.quantity, 0)}</span>
            </h2>
            <DeckCardList deckId={v.deck.id} rows={rows} />
          </section>
        );
      })}
      {maybe.length > 0 && (
        <section className="space-y-1">
          <h2 className="text-sm font-semibold">
            Maybeboard <span className="font-normal text-muted">{maybe.length}</span>
          </h2>
          <DeckCardList deckId={v.deck.id} rows={maybe} />
        </section>
      )}
      <DeckUndoBar deckId={v.deck.id} />
    </div>
  );
}
