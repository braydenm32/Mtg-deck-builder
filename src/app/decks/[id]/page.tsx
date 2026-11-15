import { Badge, Panel } from "@/components/ui";
import { DeckActions } from "@/components/DeckActions";
import { ROLE_LABELS } from "@/lib/deck/roles";
import type { BuildSettings } from "@/lib/deck/store";
import { deckHealth, loadDeck } from "./data";

export default async function DeckOverview({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const v = await loadDeck(id);
  const h = deckHealth(v);
  const settings = v.deck.settings as BuildSettings;
  const main = v.cards.filter((c) => c.board === "main");
  const byLocation = new Map<string, number>();
  for (const c of main) if (c.state === "placed" && !c.basic) byLocation.set(c.location || "No location", (byLocation.get(c.location || "No location") ?? 0) + c.quantity);
  const base = `/api/decks/${v.deck.id}/export`;
  return (
    <div className="grid min-w-0 gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="min-w-0 space-y-4">
        <Panel className="space-y-3">
          <h2 className="font-semibold">Health</h2>
          <ul className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
            {h.checks.map((c) => (
              <li key={c.role} className="flex items-baseline justify-between gap-2 rounded-md border border-line px-3 py-2">
                <span className="text-muted">{c.role === "land" ? "Lands" : ROLE_LABELS[c.role]}</span>
                <span className={c.low ? "font-semibold text-warn" : "font-semibold"}>
                  {c.count}
                  <span className="text-xs font-normal text-muted">/{c.target}</span>
                </span>
              </li>
            ))}
            <li className="flex items-baseline justify-between gap-2 rounded-md border border-line px-3 py-2">
              <span className="text-muted">Avg. mana value</span>
              <span className="font-semibold">{h.avgMv.toFixed(2)}</span>
            </li>
          </ul>
          {h.mdfc > 0 && <p className="text-xs text-muted">Plus {h.mdfc} spell/land double-faced cards.</p>}
          <p className="text-sm">
            {h.gameChangers.length ? (
              <>
                <Badge tone="warn">Game Changers: {h.gameChangers.length}</Badge> <span className="text-muted">{h.gameChangers.join(", ")}</span>
              </>
            ) : (
              <span className="text-muted">No Game Changers.</span>
            )}
          </p>
        </Panel>

        <Panel className="space-y-2">
          <h2 className="font-semibold">Pull list</h2>
          {byLocation.size ? (
            <ul className="text-sm">
              {[...byLocation.entries()]
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([loc, n]) => (
                  <li key={loc} className="flex justify-between border-b border-line py-2 last:border-0">
                    <span>{loc}</span>
                    <span className="text-muted">{n} cards</span>
                  </li>
                ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">{v.claiming ? "No owned cards placed yet." : "Set the deck to Building to place your copies."}</p>
          )}
          <a className="inline-flex min-h-11 items-center text-sm text-accent underline" href={`/decks/${v.deck.id}/cards?group=location`}>
            See cards by location
          </a>
        </Panel>

        <Panel className="space-y-2">
          <h2 className="font-semibold">Export</h2>
          <p className="text-sm text-muted">Text lists that Moxfield, Archidekt and most apps can import.</p>
          <div className="flex flex-wrap gap-2 text-sm">
            <a className="inline-flex min-h-11 items-center rounded-md border border-line px-3" href={`${base}?format=text&download=1`}>
              Decklist
            </a>
            <a className="inline-flex min-h-11 items-center rounded-md border border-line px-3" href={`${base}?format=missing&download=1`}>
              Cards I still need
            </a>
            <a className="inline-flex min-h-11 items-center rounded-md border border-line px-3" href={`${base}?format=pull&download=1`}>
              Pull list
            </a>
          </div>
        </Panel>
      </div>
      <Panel className="min-w-0">
        <DeckActions deckId={v.deck.id} name={v.deck.name} status={v.deck.status} suggestUnowned={settings.suggestUnowned ?? true} maxPrice={settings.maxPrice} />
      </Panel>
    </div>
  );
}
