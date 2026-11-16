import Link from "next/link";
import type { DeckRow, LoadedDeck } from "@/app/decks/[id]/data";
import { DeckAddCard } from "@/components/DeckAddCard";
import { DeckToast } from "./DeckRowActions";
import { DeckRows, RowGroup } from "./DeckRows";
import { DeckStacks } from "./DeckStacks";
import { deckIdentity } from "./slots";

/**
 * The deck's Cards tab in the new look: a calm editor you can use one-handed at the store. Add a card
 * at the top, group by role, type or location (kept in the URL), and every row's actions are a tap
 * away, in a sheet on a phone. Grouping and order are the old tab's, passed in from the page.
 */
export function CardsView({
  v,
  groups,
  group,
  keys,
  label,
  view = "list",
}: {
  v: LoadedDeck;
  groups: { key: string; label: string }[];
  group: string;
  keys: [string, DeckRow[]][];
  label: (k: string) => string;
  /** "stacks" shows the cards as piles of card images; the list is the default. */
  view?: "list" | "stacks";
}) {
  const maybe = v.cards.filter((c) => c.board === "maybe");
  return (
    <div className="space-y-5">
      <div className="space-y-3">
        <DeckAddCard deckId={v.deck.id} identity={deckIdentity(v.deck.colorIdentity, v.commanders)} toasts />
        <Link href={`/scan?into=deck:${v.deck.id}`} className="inline-flex min-h-11 items-center text-sm font-medium text-accent">
          Scan cards into this deck
        </Link>
        <nav className="flex flex-wrap items-center gap-1.5" aria-label="Group cards by">
          <span className="mr-1 text-sm text-muted">Group by</span>
          {groups.map((g) => (
            <Link
              key={g.key}
              href={`?group=${g.key}${view === "stacks" ? "&view=stacks" : ""}`}
              aria-current={g.key === group ? "true" : undefined}
              className={`inline-flex min-h-11 items-center rounded-full border px-4 text-sm ${g.key === group ? "border-transparent bg-foreground font-semibold text-background" : "border-line text-muted hover:text-foreground"}`}
            >
              {g.label}
            </Link>
          ))}
        </nav>
        <nav className="flex flex-wrap items-center gap-1.5" aria-label="Show cards as">
          <span className="mr-1 text-sm text-muted">Show as</span>
          {(["list", "stacks"] as const).map((x) => (
            <Link
              key={x}
              href={`?group=${group}${x === "stacks" ? "&view=stacks" : ""}`}
              aria-current={x === view ? "true" : undefined}
              className={`inline-flex min-h-11 items-center rounded-full border px-4 text-sm ${x === view ? "border-transparent bg-foreground font-semibold text-background" : "border-line text-muted hover:text-foreground"}`}
            >
              {x === "list" ? "List" : "Stacks"}
            </Link>
          ))}
        </nav>
      </div>
      {keys.length === 0 && (
        <div className="rounded-2xl border border-line bg-panel p-4">
          <p className="text-sm text-muted">No cards yet. Add one above, or let the builder fill the 99 from your cards.</p>
          <Link className="mt-2 inline-flex min-h-11 items-center rounded-xl border border-line px-4 text-sm font-medium hover:bg-background" href={`/decks/${v.deck.id}`}>
            Build it on the Overview
          </Link>
        </div>
      )}
      {view === "stacks" && keys.length > 0 && (
        <DeckStacks v={v} piles={[...keys.map(([k, rows]) => ({ key: k, title: label(k), rows })), ...(maybe.length ? [{ key: "maybe", title: "Maybeboard", rows: maybe }] : [])]} />
      )}
      {view === "list" && keys.map(([k, rows]) => (
        <RowGroup key={k} title={label(k)} count={rows.reduce((n, c) => n + c.quantity, 0)}>
          <DeckRows deckId={v.deck.id} rows={rows} columns />
        </RowGroup>
      ))}
      {view === "list" && maybe.length > 0 && (
        <RowGroup title="Maybeboard" count={maybe.length} help="Not in the 100. Move a card into the deck from its ⋯ menu.">
          <DeckRows deckId={v.deck.id} rows={maybe} columns />
        </RowGroup>
      )}
      <DeckToast />
    </div>
  );
}
