import Link from "next/link";
import { Badge } from "@/components/ui";
import type { CardVerdict, DeckMechanic, SynergyReport } from "@/lib/deck/synergy";
import type { PriceView } from "@/lib/money";
import { DeckToast } from "./DeckRowActions";
import { SynergySuggestions } from "./SynergySuggestions";

/*
 * The deck's Synergy tab: how well its cards work together. The score leads, then the mechanics the
 * deck plays, cards to add that fit them (owned first), and every card ranked against the mechanics.
 * Built from the same panels, rows and meters as the Overview and Upgrades tabs, so nothing new to
 * learn and no new styles.
 */

const panel = "min-w-0 rounded-2xl border border-line bg-panel";
/** Rows shown before "Show all". */
const FIRST = 10;

function Meter({ value, low }: { value: number; low?: boolean }) {
  return (
    <span className="relative h-1.5 min-w-8 overflow-hidden rounded-full bg-skeleton" aria-hidden>
      <i className={`absolute inset-y-0 left-0 rounded-full ${low ? "bg-warn" : "bg-[var(--accent-text)]/70"}`} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </span>
  );
}

/** The score, its label and the three parts behind it. */
function ScorePanel({ report, commander }: { report: SynergyReport; commander: string }) {
  const rows = [
    { key: "fit", label: "On plan", help: "Cards that play into the deck’s mechanics", value: report.parts.fit },
    { key: "engines", label: "Engines", help: "Enough cards making and using each main mechanic", value: report.parts.engines },
    { key: "commander", label: "Commander", help: `Cards that work with ${commander}`, value: report.parts.commander },
  ];
  return (
    <section className={`${panel} space-y-3 p-4`} aria-labelledby="synergy-h">
      <h2 id="synergy-h" className="text-lg font-semibold">
        Synergy
      </h2>
      <div className="flex items-start gap-4">
        <p className="flex shrink-0 items-baseline gap-1">
          <span className="grad-text text-5xl font-bold leading-none tabular-nums [font-family:var(--font-sora)]">{report.score}</span>
          <span className="text-muted">/ 100</span>
        </p>
        <div className="min-w-0 space-y-1 text-sm">
          <p className="font-semibold">{report.label}</p>
          <p className="text-muted">{report.summary}</p>
        </div>
      </div>
      <ul className="divide-y divide-line">
        {rows.map((r) => (
          <li key={r.key} className="grid min-h-11 grid-cols-[6.5rem_minmax(2rem,1fr)_auto] items-center gap-3 text-sm" title={r.help}>
            <span className="text-muted">{r.label}</span>
            <Meter value={r.value} low={r.value < 40} />
            <span className="w-8 text-right font-semibold tabular-nums">{r.value}</span>
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted">
        {report.parts.combos > 0 ? `${report.parts.combos} ${report.parts.combos === 1 ? "combo adds" : "combos add"} to the score. ` : ""}
        {report.hasEdhrec ? "Uses the cards’ rules text and EDHREC’s synergy with your commander." : "From the cards’ rules text (EDHREC’s numbers weren’t ready; they’ll be used next time)."}
      </p>
    </section>
  );
}

function MechanicRow({ m }: { m: DeckMechanic }) {
  const total = m.cards.length;
  return (
    <li>
      <details className="group">
        <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-4 py-2 hover:bg-background">
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-1.5">
              <span className="text-[15px] font-medium">{m.label}</span>
              {m.theme && <Badge tone="accent">Theme</Badge>}
              {m.commander && <Badge tone="muted">Commander</Badge>}
            </span>
            <span className="block text-xs text-muted">
              {m.enablers} {m.enablers === 1 ? "card makes" : "cards make"} it · {m.payoffs} {m.payoffs === 1 ? "card uses" : "cards use"} it
            </span>
          </span>
          <span className="shrink-0 text-sm tabular-nums text-muted">{total}</span>
          <span className="shrink-0 text-muted transition-transform group-open:rotate-90" aria-hidden>
            ›
          </span>
        </summary>
        <p className="px-4 pb-3 text-sm text-muted">{m.cards.join(", ")}</p>
      </details>
    </li>
  );
}

function Mechanics({ report }: { report: SynergyReport }) {
  return (
    <section className={panel} aria-labelledby="mechanics-h">
      <div className="flex flex-wrap items-baseline justify-between gap-2 px-4 pb-1 pt-3">
        <h2 id="mechanics-h" className="text-lg font-semibold">
          Mechanics
        </h2>
        <span className="text-sm text-muted">Tap one to see its cards</span>
      </div>
      {report.mechanics.length ? (
        <ul className="divide-y divide-line">
          {report.mechanics.map((m) => (
            <MechanicRow key={m.id} m={m} />
          ))}
        </ul>
      ) : (
        <p className="px-4 pb-4 text-sm text-muted">No mechanic has enough cards making it and using it yet. A theme in Deck settings, or a few more cards of one plan, will show up here.</p>
      )}
    </section>
  );
}

function VerdictRow({ c }: { c: CardVerdict }) {
  return (
    <li className="flex min-h-14 min-w-0 items-center gap-3 bg-panel py-2 pl-3 pr-3">
      <span className="w-8 shrink-0 text-right text-[15px] font-semibold tabular-nums">{c.score}</span>
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 flex-wrap items-center gap-1.5">
          <span className="min-w-0 truncate text-[15px] font-medium">{c.name}</span>
          {c.cut && <Badge tone="warn">Cut candidate</Badge>}
          {c.staple && <Badge tone="muted">Staple</Badge>}
          {c.combo && <Badge tone="accent">Combo</Badge>}
        </span>
        <span className="mt-0.5 line-clamp-2 text-xs text-muted">{c.reason}</span>
      </span>
    </li>
  );
}

function VerdictList({ rows, first = FIRST }: { rows: CardVerdict[]; first?: number }) {
  const list = (xs: CardVerdict[]) => (
    <ul className="grid gap-px overflow-hidden rounded-xl border border-line bg-line">
      {xs.map((c) => (
        <VerdictRow key={c.name} c={c} />
      ))}
    </ul>
  );
  if (rows.length <= first + 2) return list(rows);
  return (
    <div className="space-y-2">
      {list(rows.slice(0, first))}
      <details className="group">
        <summary className="flex min-h-11 cursor-pointer list-none items-center text-sm font-medium text-accent group-open:hidden">Show all {rows.length}</summary>
        {list(rows.slice(first))}
      </details>
    </div>
  );
}

function Ranking({ report }: { report: SynergyReport }) {
  const cuts = report.cards.filter((c) => c.cut);
  return (
    <section className={`${panel} space-y-4 p-4`} aria-labelledby="ranking-h">
      <div className="space-y-1">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="ranking-h" className="text-lg font-semibold">
            Card ranking
          </h2>
          <span className="text-sm tabular-nums text-muted">{report.cards.length}</span>
        </div>
        <p className="text-sm text-muted">Each card out of 100 for how well it works with the rest of the deck. Staples keep the deck running, so they’re never marked to cut.</p>
      </div>
      {report.cards.length ? <VerdictList rows={report.cards} /> : <p className="text-sm text-muted">No spells in the deck yet.</p>}
      {cuts.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-[15px] font-semibold">
            Cut candidates <span className="font-normal tabular-nums text-muted">{cuts.length}</span>
          </h3>
          <p className="text-sm text-muted">The weakest fits for the deck’s mechanics. Swap them for cards above that fit better.</p>
          <VerdictList rows={cuts} />
        </div>
      )}
      <div className="space-y-2">
        <h3 className="text-[15px] font-semibold">
          Lands <span className="font-normal tabular-nums text-muted">{report.lands.length + report.basics}</span>
        </h3>
        {report.lands.length > 0 && <VerdictList rows={report.lands} first={5} />}
        {report.basics > 0 && (
          <p className="text-sm text-muted">
            {report.basics} basic {report.basics === 1 ? "land" : "lands"}: mana only, so not ranked.
          </p>
        )}
      </div>
    </section>
  );
}

export function SynergyView({ deckId, report, commander, pv }: { deckId: number; report: SynergyReport; commander: string; pv: PriceView }) {
  if (!report.cards.length && !report.lands.length) {
    return (
      <div className={`${panel} space-y-1 p-4`}>
        <p className="font-semibold">Nothing to rate yet</p>
        <p className="text-sm text-muted">Add cards or build the deck, and this shows how well they work together, with cards that would fit.</p>
        <Link className="mt-2 inline-flex min-h-11 items-center rounded-xl border border-line px-4 text-sm font-medium hover:bg-background" href={`/decks/${deckId}#settings`}>
          Build in Deck settings
        </Link>
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <div className="grid min-w-0 gap-4 min-[900px]:grid-cols-2 min-[900px]:items-start">
        <div className="min-w-0 space-y-4">
          <ScorePanel report={report} commander={commander} />
          <Mechanics report={report} />
          <SynergySuggestions deckId={deckId} pv={pv} />
        </div>
        <div className="min-w-0">
          <Ranking report={report} />
        </div>
      </div>
      <DeckToast />
    </div>
  );
}

/** The Overview's small synergy panel: the score, its label, the top mechanics and a link to the tab. */
export function SynergyPanel({ deckId, report }: { deckId: number; report: SynergyReport }) {
  return (
    <section className={`${panel} space-y-3 p-4`} aria-labelledby="synergy-o-h">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="synergy-o-h" className="text-lg font-semibold">
          Synergy
        </h2>
        <Link href={`/decks/${deckId}/synergy`} className="inline-flex min-h-11 items-center text-sm font-medium text-accent">
          Card ranking
        </Link>
      </div>
      <div className="flex items-start gap-4">
        <p className="flex shrink-0 items-baseline gap-1">
          <span className="text-4xl font-bold leading-none tabular-nums [font-family:var(--font-sora)]">{report.score}</span>
          <span className="text-sm text-muted">/ 100</span>
        </p>
        <div className="min-w-0 space-y-1 text-sm">
          <p className="font-semibold">{report.label}</p>
          {report.mechanics.length > 0 && (
            <p className="flex flex-wrap gap-1.5">
              {report.mechanics.slice(0, 4).map((m) => (
                <Badge key={m.id} tone={m.theme ? "accent" : "muted"}>
                  {m.label}
                </Badge>
              ))}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
