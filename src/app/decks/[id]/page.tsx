import { Badge, ColorPips, Panel } from "@/components/ui";
import { DeckActions } from "@/components/DeckActions";
import { ManaCurve } from "@/components/ManaCurve";
import { BRACKETS } from "@/lib/deck/bracket";
import { ROLE_LABELS } from "@/lib/deck/roles";
import { targetBracketOf, type BuildSettings } from "@/lib/deck/store";
import { getPriceView } from "@/lib/settings";
import { analyze, loadDeck } from "./data";

const PRIORITY = { 1: "Must fix", 2: "Should fix", 3: "Worth a look" } as const;
const pct = (n: number) => `${Math.round(n * 100)}%`;

export default async function DeckOverview({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const v = await loadDeck(id);
  const [a, pv] = await Promise.all([analyze(v), getPriceView()]);
  const s = a.stats;
  const settings = v.deck.settings as BuildSettings;
  const target = targetBracketOf(settings);
  const main = v.cards.filter((c) => c.board === "main");
  const byLocation = new Map<string, number>();
  for (const c of main) if (c.state === "placed" && !c.basic) byLocation.set(c.location || "No location", (byLocation.get(c.location || "No location") ?? 0) + c.quantity);
  const base = `/api/decks/${v.deck.id}/export`;
  const errors = a.validation.issues.filter((i) => i.severity === "error");
  return (
    <div className="grid min-w-0 gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="min-w-0 space-y-4">
        <Panel className="space-y-2">
          <h2 className="flex flex-wrap items-center gap-2 font-semibold">
            To do
            {errors.length ? <Badge tone="danger">Not legal yet</Badge> : <Badge tone="ok">Legal</Badge>}
            <span className="text-sm font-normal text-muted">{a.validation.deckSize} / 100 cards</span>
          </h2>
          {a.advice.length ? (
            <ul className="space-y-2 text-sm">
              {a.advice.map((x) => (
                <li key={x.kind + x.message} className="flex items-start gap-2">
                  <Badge tone={x.priority === 1 ? "danger" : x.priority === 2 ? "warn" : "muted"} className="mt-0.5 shrink-0">
                    {PRIORITY[x.priority]}
                  </Badge>
                  <span>{x.message}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">Nothing to fix. The deck is legal and its mana and roles look healthy.</p>
          )}
          {a.validation.deckSize < 100 && (
            <p className="text-sm text-muted">Tip: Rebuild deck (below) fills the open slots from your collection and keeps every card you have now.</p>
          )}
        </Panel>

        <Panel className="space-y-2">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="flex flex-wrap items-center gap-2 font-semibold">
              <span>
                Bracket {a.bracket.bracket}
                {a.bracket.bracket < 5 && a.bracket.reasons.length ? "+" : ""} · {a.bracket.name}
              </span>
              {a.bracket.bracket > target ? <Badge tone="danger">Over your target of {target}</Badge> : <Badge tone="ok">Target {target}</Badge>}
            </h2>
            <span className="text-xs text-muted">{BRACKETS[a.bracket.bracket].turns}</span>
          </div>
          <p className="text-sm">{a.bracket.summary}</p>
          {a.bracket.reasons.length > 0 && (
            <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
              {a.bracket.reasons.map((r) => (
                <li key={r.code + r.message}>{r.message}</li>
              ))}
            </ul>
          )}
          <p className="text-xs text-muted">An estimate from the cards alone. Your pod decides the final bracket.</p>
        </Panel>

        <Panel className="space-y-3">
          <h2 className="font-semibold">Health</h2>
          <ul className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
            <li className="flex items-baseline justify-between gap-2 rounded-md border border-line px-3 py-2">
              <span className="text-muted">Lands</span>
              <span className={s.landAdvice.delta > 1 ? "font-semibold text-warn" : "font-semibold"}>
                {s.lands}
                {s.mdfcLands ? <span className="text-xs font-normal text-muted">+{s.mdfcLands}</span> : null}
                <span className="text-xs font-normal text-muted">/{s.landAdvice.recommended}</span>
              </span>
            </li>
            {s.checklist
              .filter((r) => r.role !== "land")
              .map((r) => (
                <li key={r.role} className="flex items-baseline justify-between gap-2 rounded-md border border-line px-3 py-2">
                  <span className="text-muted">{ROLE_LABELS[r.role]}</span>
                  <span className={r.status === "low" ? "font-semibold text-warn" : "font-semibold"}>
                    {r.count}
                    <span className="text-xs font-normal text-muted">/{r.target}</span>
                  </span>
                </li>
              ))}
            <li className="flex items-baseline justify-between gap-2 rounded-md border border-line px-3 py-2">
              <span className="text-muted">Avg. mana value</span>
              <span className="font-semibold">{s.averageManaValue.toFixed(2)}</span>
            </li>
          </ul>
          <p className="text-sm text-muted">{s.landAdvice.summary}</p>
          <p className="text-sm">
            {s.gameChangers.length ? (
              <>
                <Badge tone="warn">Game Changers: {s.gameChangers.length}</Badge> <span className="text-muted">{s.gameChangers.join(", ")}</span>
              </>
            ) : (
              <span className="text-muted">No Game Changers.</span>
            )}
          </p>
        </Panel>

        <Panel className="space-y-2">
          <h2 className="font-semibold">Mana curve</h2>
          <ManaCurve curve={s.curve} />
        </Panel>

        {s.colors.length > 0 && (
          <Panel className="space-y-2">
            <h2 className="font-semibold">Colours</h2>
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-muted">
                <tr>
                  <th className="py-1 font-normal">Colour</th>
                  <th className="py-1 font-normal">Pips</th>
                  <th className="py-1 font-normal">Land sources</th>
                  <th className="py-1 font-normal">Other sources</th>
                </tr>
              </thead>
              <tbody>
                {s.colors.map((c) => (
                  <tr key={c.color} className="border-t border-line">
                    <td className="py-2">
                      <ColorPips identity={c.color} />
                    </td>
                    <td>{pct(c.pipShare)}</td>
                    <td>{c.landSources}</td>
                    <td>{c.otherSources}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {s.colors
              .filter((c) => c.hardest && c.hardest.chanceOnCurve < 0.8)
              .map((c) => (
                <p key={c.color} className="text-xs text-muted">
                  {c.hardest!.name} needs {c.hardest!.pips} {c.color} pip{c.hardest!.pips === 1 ? "" : "s"}: {pct(c.hardest!.chanceOnCurve)} chance to cast on curve.
                </p>
              ))}
          </Panel>
        )}

        {(a.combos.length > 0 || a.near.length > 0) && (
          <Panel className="space-y-2">
            <h2 className="font-semibold">Combos</h2>
            {a.combos.map((c) => (
              <p key={c.cards.join()} className="text-sm">
                <span className="font-medium">{c.cards.join(" + ")}</span>: <span className="text-muted">{c.result}</span>
              </p>
            ))}
            {a.near.slice(0, 5).map((n) => (
              <p key={n.combo.cards.join()} className="text-sm text-muted">
                One card away: add <span className="text-foreground">{n.missing}</span>
                {n.owned ? " (you own it)" : ""} for {n.combo.cards.join(" + ")} ({n.combo.result})
              </p>
            ))}
          </Panel>
        )}

        <Panel className="space-y-2">
          <h2 className="font-semibold">Pull list</h2>
          {byLocation.size ? (
            <ul className="text-sm">
              {[...byLocation.entries()]
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([loc, n]) => (
                  <li key={loc} className="flex justify-between border-b border-line py-2 last:border-0">
                    <span>{loc}</span>
                    <span className="text-muted">
                      {n} {n === 1 ? "card" : "cards"}
                    </span>
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
          <p className="text-sm text-muted">Text lists for other apps. Moxfield and Archidekt lists include the printing you own.</p>
          <div className="flex flex-wrap gap-2 text-sm">
            {(
              [
                ["text", "Plain list"],
                ["moxfield", "Moxfield"],
                ["archidekt", "Archidekt"],
                ["arena", "Arena"],
                ["mtgo", "MTGO"],
                ["missing", "Cards I still need"],
                ["pull", "Pull list"],
              ] as const
            ).map(([f, label]) => (
              <a key={f} className="inline-flex min-h-11 items-center rounded-md border border-line px-3" href={`${base}?format=${f}&download=1`}>
                {label}
              </a>
            ))}
          </div>
        </Panel>
      </div>
      <Panel className="min-w-0">
        <DeckActions deckId={v.deck.id} name={v.deck.name} status={v.deck.status} suggestUnowned={settings.suggestUnowned ?? true}
          maxPrice={settings.maxPrice}
          targetBracket={targetBracketOf(settings)}
          prices={pv}
        />
      </Panel>
    </div>
  );
}
