import Image from "next/image";
import Link from "next/link";
import type { LoadedDeck } from "@/app/decks/[id]/data";
import { DeckActions } from "@/components/DeckActions";
import { ManaCurve } from "@/components/ManaCurve";
import { Badge, ColorPips, money } from "@/components/ui";
import { BRACKETS, type FoundCombo } from "@/lib/deck/bracket";
import type { Combo } from "@/lib/deck/combos";
import { ROLE_LABELS } from "@/lib/deck/roles";
import { rule0Summary } from "@/lib/deck/rule0";
import type { SaltyCard } from "@/lib/edhrec/salt";
import type { DeckAnalysis } from "@/lib/deck/analysis";
import { STATUS_LABEL, targetBracketOf, type BuildSettings } from "@/lib/deck/status";
import { themeLabel } from "@/lib/deck/themes";
import { formatDate } from "@/lib/format";
import type { PriceView } from "@/lib/money";
import { DeckNextButton } from "./DeckNextButton";
import { DeckNotes } from "./DeckNotes";
import { ManaBaseHelper } from "./ManaBaseHelper";
import { Rule0Card } from "./Rule0Card";
import { DeckTokens } from "./DeckTokens";
import { DeckToast } from "./DeckRowActions";
import { adviceAction, artCrop, deckIdentity, nextStep, OPEN_ORDER, OPEN_SHORT, slotCounts, type NextStep } from "./slots";

/*
 * The deck's Overview in the new look: the one tab that carries the deck's summary (CALM 6). The
 * summary strip leads, with the next step as the screen's only main button; then To do, Health, the
 * curve and the bracket; then detail (combos, pull list, colours) and the deck's settings. Every
 * number comes from getDeck() or analyzeDeck(), as on the old Overview. No server code, so the device
 * can draw it too (src/components/offline/DeviceTabs.tsx).
 */

type Analysis = DeckAnalysis;

const PRIORITY = { 1: "Must fix", 2: "Should fix", 3: "Worth a look" } as const;
const TONE = { 1: "danger", 2: "warn", 3: "muted" } as const;
const pct = (n: number) => `${Math.round(n * 100)}%`;
const panel = "min-w-0 rounded-2xl border border-line bg-panel";
const STATUS_TONE = { idea: "muted", building: "accent", built: "ok", retired: "muted" } as const;
const SEGMENT: Record<string, string> = { free: "bg-[var(--accent-text)]", shared: "bg-warn", "other-deck": "bg-warn/50", "not-owned": "bg-transparent", "no-data": "bg-transparent" };

function StepAction({ step, v, settings }: { step: NextStep; v: LoadedDeck; settings: BuildSettings }) {
  const a = step.action;
  if (!a) return null;
  const quiet = step.tone === "quiet";
  if ("run" in a) {
    return (
      <DeckNextButton
        deckId={v.deck.id}
        run={a.run}
        label={a.label}
        quiet={quiet}
        rebuild={{ suggestUnowned: settings.suggestUnowned ?? true, ...(settings.maxPrice ? { maxPrice: settings.maxPrice } : {}) }}
      />
    );
  }
  const cls = `inline-flex min-h-11 shrink-0 items-center justify-center whitespace-nowrap rounded-xl px-4 text-sm font-semibold ${quiet ? "border border-line hover:bg-background" : "bg-accent text-accent-fg"}`;
  return a.href.startsWith("#") ? (
    <a href={a.href} className={cls}>
      {a.label}
    </a>
  ) : (
    <Link href={a.href} className={cls}>
      {a.label}
    </Link>
  );
}

/** Commander art, status, progress, what's open and what it costs, and the next step. */
function Summary({ v, pv, step, settings }: { v: LoadedDeck; pv: PriceView; step: NextStep; settings: BuildSettings }) {
  const counts = slotCounts(v.cards);
  // An idea or retired deck counts its free copies as in hand (getDeck's progress), so they aren't "open".
  const open = OPEN_ORDER.filter((s) => counts[s] > 0 && (v.claiming || (s !== "free" && s !== "shared")));
  const art = artCrop(v.commanders[0]?.imageNormal);
  const of = Math.max(1, v.progress.of);
  const cost = !pv.hide && v.costToFinish > 0 ? money(v.costToFinish, pv) : null;
  return (
    <section aria-label="Summary" className={`${panel} overflow-hidden min-[900px]:grid min-[900px]:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]`}>
      <div className="relative h-40 bg-skeleton min-[900px]:h-auto min-[900px]:min-h-60">
        {art && <Image src={art} alt="" fill priority sizes="(min-width: 900px) 40vw, 100vw" className="object-cover" />}
        <div className="absolute inset-0 bg-linear-to-t from-panel via-panel/40 to-transparent min-[900px]:via-panel/20" />
        <div className="absolute inset-x-0 bottom-0 space-y-2 p-4">
          <p className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-lg font-semibold leading-tight [font-family:var(--font-sora)] [text-shadow:0_1px_8px_var(--art-shadow,rgb(0_0_0/0.6))]">
              {v.commanders.map((c) => c.name).join(" + ")}
            </span>
            <ColorPips identity={deckIdentity(v.deck.colorIdentity, v.commanders)} />
          </p>
          <p className="flex flex-wrap gap-1.5">
            <Badge tone={STATUS_TONE[v.deck.status]} className="bg-panel/80">
              {STATUS_LABEL[v.deck.status]}
            </Badge>
            {v.deck.theme && (
              <Badge tone="muted" className="bg-panel/80">
                {themeLabel(v.deck.theme)}
              </Badge>
            )}
          </p>
        </div>
      </div>
      <div className="min-w-0 space-y-4 p-4">
        <div className="space-y-2">
          <p className="flex items-baseline gap-2">
            <span className="grad-text text-5xl font-bold leading-none tabular-nums [font-family:var(--font-sora)]">{v.progress.placed}</span>
            <span className="text-muted">of {v.progress.of} cards in hand</span>
          </p>
          <div
            role="progressbar"
            aria-label="Cards in hand"
            aria-valuenow={v.progress.placed}
            aria-valuemin={0}
            aria-valuemax={v.progress.of}
            className="flex h-2 w-full overflow-hidden rounded-full bg-skeleton"
          >
            <div className="h-full bg-accent" style={{ width: `${(v.progress.placed / of) * 100}%` }} />
            {open.map((s) => (
              <div key={s} className={`h-full ${SEGMENT[s]}`} style={{ width: `${(counts[s] / of) * 100}%` }} />
            ))}
          </div>
          {open.length > 0 && (
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
              {open.map((s) => (
                <span key={s} className="inline-flex items-center gap-1.5">
                  <i className={`h-2 w-2 rounded-full ${s === "not-owned" || s === "no-data" ? "border border-muted" : SEGMENT[s]}`} aria-hidden />
                  <b className="font-semibold text-foreground tabular-nums">{counts[s]}</b> {OPEN_SHORT[s]}
                  {s === "not-owned" && cost && <span>· {cost} to finish</span>}
                </span>
              ))}
            </p>
          )}
        </div>
        <div className={`flex min-w-0 items-center gap-3 rounded-xl border p-3 ${step.tone === "go" ? "border-[var(--accent-text)]/30 bg-[var(--panel-2)]" : "border-line"}`}>
          <div className="min-w-0 flex-1">
            <p className="font-semibold">{step.tone === "go" ? `Next: ${step.title[0].toLowerCase()}${step.title.slice(1)}` : step.title}</p>
            {step.detail && <p className="text-sm text-muted">{step.detail}</p>}
          </div>
          <StepAction step={step} v={v} settings={settings} />
        </div>
        <p className="text-xs text-muted">Updated {formatDate(v.deck.updatedAt)}</p>
      </div>
    </section>
  );
}

function ToDo({ a, deckId }: { a: Analysis; deckId: number }) {
  const errors = a.validation.issues.filter((i) => i.severity === "error");
  return (
    <section id="todo" className={`${panel} scroll-mt-28`}>
      <div className="flex flex-wrap items-center gap-2 px-4 pb-1 pt-3">
        <h2 className="text-lg font-semibold">To do</h2>
        {errors.length ? <Badge tone="danger">Not legal yet</Badge> : <Badge tone="ok">Legal</Badge>}
      </div>
      {a.advice.length ? (
        <ul className="divide-y divide-line">
          {a.advice.map((x, i) => {
            const act = adviceAction(x.kind, deckId);
            return (
              <li key={`${x.kind}-${i}`} className="flex min-w-0 items-start gap-2 py-2 pl-4 pr-2">
                <p className="min-w-0 flex-1 py-1.5 text-sm">
                  <Badge tone={TONE[x.priority]} className="mr-2 align-[1px]">
                    {PRIORITY[x.priority]}
                  </Badge>
                  {x.message}
                </p>
                <Link href={act.href} className="inline-flex min-h-11 shrink-0 items-center rounded-lg px-2 text-sm font-medium text-accent hover:bg-background">
                  {act.label}
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="px-4 pb-4 text-sm text-muted">Nothing to fix. The deck is legal and its mana and roles look healthy.</p>
      )}
    </section>
  );
}

function Meter({ value, of, low }: { value: number; of: number; low: boolean }) {
  return (
    <span className="relative h-1.5 min-w-8 overflow-hidden rounded-full bg-skeleton" aria-hidden>
      <i className={`absolute inset-y-0 left-0 rounded-full ${low ? "bg-warn" : "bg-[var(--accent-text)]/70"}`} style={{ width: `${Math.min(100, (value / Math.max(1, of)) * 100)}%` }} />
    </span>
  );
}

/** Lands and each role against its target, in one compact list (R9, R10, R11). */
function Health({ a }: { a: Analysis }) {
  const s = a.stats;
  const landLow = s.landAdvice.delta > 1;
  const rows = [
    {
      key: "land",
      label: "Lands",
      low: landLow,
      meter: <Meter value={s.lands} of={s.landAdvice.recommended} low={landLow} />,
      value: (
        <>
          {s.lands}
          {s.mdfcLands ? <span className="font-normal text-muted"> +{s.mdfcLands} MDFC</span> : null}
          <span className="font-normal text-muted"> / {s.landAdvice.recommended}</span>
        </>
      ),
    },
    ...s.checklist
      .filter((r) => r.role !== "land")
      .map((r) => ({
        key: r.role,
        label: ROLE_LABELS[r.role],
        low: r.status === "low",
        meter: <Meter value={r.count} of={r.target} low={r.status === "low"} />,
        value: (
          <>
            {r.count}
            <span className="font-normal text-muted"> / {r.target}</span>
          </>
        ),
      })),
  ];
  const landsInToDo = a.advice.some((x) => x.kind === "lands");
  return (
    <section className={panel} aria-labelledby="health-h">
      <div className="flex flex-wrap items-baseline justify-between gap-2 px-4 pb-1 pt-3">
        <h2 id="health-h" className="text-lg font-semibold">
          Health
        </h2>
        <span className="text-sm text-muted">
          Avg mana value <b className="font-semibold text-foreground tabular-nums">{s.averageManaValue.toFixed(2)}</b>
        </span>
      </div>
      <ul className="divide-y divide-line">
        {rows.map((r) => (
          <li key={r.key} className="grid min-h-11 grid-cols-[6.5rem_minmax(2rem,1fr)_auto_1.25rem] items-center gap-3 px-4 text-sm">
            <span className="text-muted">{r.label}</span>
            {r.meter}
            <span className="text-right font-semibold tabular-nums">{r.value}</span>
            <span className={`text-center ${r.low ? "text-warn" : "text-ok"}`}>
              <span aria-hidden>{r.low ? "!" : "✓"}</span>
              <span className="sr-only">{r.low ? "below target" : "on target"}</span>
            </span>
          </li>
        ))}
      </ul>
      {!landsInToDo && <p className="px-4 pb-3 pt-1 text-sm text-muted">{s.landAdvice.summary}</p>}
    </section>
  );
}

/** The bracket as a floor with its reasons (R12), and the deck's target beside it. */
function BracketPanel({ a, target, v, salty }: { a: Analysis; target: number; v: LoadedDeck; salty: SaltyCard[] }) {
  const b = a.bracket;
  const gcShown = b.reasons.some((r) => r.code === "game-changers");
  return (
    <section id="bracket" className={`${panel} scroll-mt-28 space-y-3 p-4`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Bracket</h2>
        {b.bracket > target ? <Badge tone="danger">Over your target of {target}</Badge> : <Badge tone="muted">Your target: {target}</Badge>}
      </div>
      <div className="flex items-start gap-4">
        <span className="text-4xl font-bold leading-none tabular-nums [font-family:var(--font-sora)]">
          {b.bracket}
          {b.bracket < 5 && b.reasons.length ? "+" : ""}
        </span>
        <div className="min-w-0 space-y-1 text-sm">
          <p className="font-semibold">
            {b.name}
            {b.bracket < 5 && b.reasons.length ? " or higher" : ""}, estimated
          </p>
          <p className="text-muted">{BRACKETS[b.bracket].turns}</p>
        </div>
      </div>
      {b.reasons.length > 0 ? (
        <ul className="space-y-1.5 text-sm">
          {b.reasons.map((r, i) => (
            <li key={`${r.code}-${i}`} className="flex gap-2">
              <span className="text-muted" aria-hidden>
                •
              </span>
              <span className="min-w-0">
                {r.message}
                {r.cards.length > 0 && r.code !== "combo-early" && r.code !== "combo-late" && <span className="text-muted"> ({r.cards.join(", ")})</span>}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm">{b.summary}</p>
      )}
      {!gcShown && a.stats.gameChangers.length > 0 && <p className="text-sm text-muted">Game Changers: {a.stats.gameChangers.join(", ")}</p>}
      <div className="flex flex-wrap items-center justify-between gap-x-3">
        <p className="text-xs text-muted">An estimate from the cards alone. Your pod decides the final bracket.</p>
        <span className="flex flex-wrap items-center gap-x-4">
          <Rule0Card summary={rule0Summary(v, a, target, salty)} />
          <a href="#settings" className="inline-flex min-h-11 items-center text-sm font-medium text-accent">
            Change the target
          </a>
        </span>
      </div>
    </section>
  );
}

const isFound = (c: Combo): c is FoundCombo => "twoCard" in c;
type ComboItem = { combo: Combo; prefix?: React.ReactNode; badge?: { tone: "ok" | "warn" | "danger"; text: string } };

function ComboRows({ items, label }: { items: ComboItem[]; label: string }) {
  const row = ({ combo: c, prefix, badge }: ComboItem, i: number) => {
    const body = (
      <>
        {badge && (
          <Badge tone={badge.tone} className="mr-1.5">
            {badge.text}
          </Badge>
        )}
        <span className="text-muted">{prefix}</span>
        <span className="font-medium">{c.cards.join(" + ")}</span>
        {c.templates?.length ? <span className="text-muted"> + {c.templates.join(", ").toLowerCase()}</span> : null}
        <span className="text-muted">: {c.result}</span>
      </>
    );
    // The whole combo is the tap target, so a phone thumb doesn't have to find the card names.
    return (
      <li key={`${c.id ?? c.cards.join()}-${i}`} className="text-sm">
        {c.url ? (
          <a className="-mx-2 block min-h-11 rounded-lg px-2 py-2.5 hover:bg-background" href={c.url} target="_blank" rel="noreferrer">
            {body}
          </a>
        ) : (
          <p className="py-2.5">{body}</p>
        )}
      </li>
    );
  };
  return (
    <div className="space-y-1.5">
      <h3 className="text-sm font-semibold">
        {label} <span className="font-normal text-muted">{items.length}</span>
      </h3>
      <ul className="divide-y divide-line">{items.slice(0, 3).map(row)}</ul>
      {items.length > 3 && (
        <details className="group">
          <summary className="flex min-h-11 cursor-pointer list-none items-center text-sm font-medium text-accent group-open:hidden">Show all {items.length}</summary>
          <ul className="divide-y divide-line border-t border-line">{items.slice(3).map((x, i) => row(x, i + 3))}</ul>
        </details>
      )}
    </div>
  );
}

function Combos({ a }: { a: Analysis }) {
  return (
    <section className={`${panel} space-y-3 p-4`}>
      <div className="flex flex-wrap items-center justify-between gap-x-2">
        <h2 className="text-lg font-semibold">Combos</h2>
        <span className="text-xs text-muted">
          {a.comboSource === "spellbook" ? (
            <>
              From{" "}
              <a className="inline-flex min-h-11 items-center underline" href="https://commanderspellbook.com" target="_blank" rel="noreferrer">
                Commander Spellbook
              </a>
            </>
          ) : (
            "Built-in list (Commander Spellbook couldn’t be reached)"
          )}
        </span>
      </div>
      {a.combos.length === 0 && a.near.length === 0 && <p className="text-sm text-muted">No combos in this deck, and none one card away.</p>}
      {a.combos.length > 0 && (
        <ComboRows
          label="In the deck"
          items={a.combos.map((c) => ({
            combo: c,
            badge: isFound(c) && c.twoCard ? (c.early ? { tone: "danger" as const, text: `Two-card combo by turn ${c.earliestTurn}` } : { tone: "warn" as const, text: "Two-card combo" }) : undefined,
          }))}
        />
      )}
      {a.near.length > 0 && (
        <ComboRows
          label="One card away"
          items={a.near.map((n) => ({
            combo: n.combo,
            prefix: (
              <>
                Add <span className="font-medium text-foreground">{n.missing}</span>:{" "}
              </>
            ),
            badge: n.owned ? { tone: "ok" as const, text: "In your collection" } : undefined,
          }))}
        />
      )}
    </section>
  );
}

function PullList({ v }: { v: LoadedDeck }) {
  // The same count the old Overview's pull list makes: placed copies per location, basics left out.
  const byLocation = new Map<string, number>();
  for (const c of v.cards) if (c.board === "main" && c.state === "placed" && !c.basic) byLocation.set(c.location || "No location", (byLocation.get(c.location || "No location") ?? 0) + c.quantity);
  return (
    <section className={`${panel} p-4`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold">Pull list</h2>
        <Link className="inline-flex min-h-11 items-center text-sm font-medium text-accent" href={`/decks/${v.deck.id}/cards?group=location`}>
          Cards by location
        </Link>
      </div>
      {byLocation.size ? (
        <ul className="text-sm">
          {[...byLocation.entries()]
            .sort(([x], [y]) => x.localeCompare(y))
            .map(([loc, n]) => (
              <li key={loc} className="flex min-h-10 items-center justify-between gap-3 border-b border-line last:border-0">
                <span className="min-w-0 truncate">{loc}</span>
                <span className="shrink-0 tabular-nums text-muted">
                  {n} {n === 1 ? "card" : "cards"}
                </span>
              </li>
            ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">{v.claiming ? "No owned cards placed yet." : "Set the deck to Building to place your copies."}</p>
      )}
    </section>
  );
}

function Colours({ a }: { a: Analysis }) {
  const s = a.stats;
  if (!s.colors.length) return null;
  // The hardest-to-cast notes that the To do list doesn't already make.
  const notes = s.colors.filter((c) => c.hardest && c.hardest.chanceOnCurve < 0.8 && !a.advice.some((x) => x.kind === "colors" && x.cards.includes(c.hardest!.name)));
  return (
    <details className={`${panel} group`}>
      <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-2 px-4">
        <h2 className="text-lg font-semibold">Colours and sources</h2>
        <span className="text-sm text-accent group-open:hidden">Show</span>
      </summary>
      <div className="space-y-2 px-4 pb-4">
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
                <td className="tabular-nums">{pct(c.pipShare)}</td>
                <td className="tabular-nums">{c.landSources}</td>
                <td className="tabular-nums">{c.otherSources}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {notes.map((c) => (
          <p key={c.color} className="text-xs text-muted">
            {c.hardest!.name} needs {c.hardest!.pips} {c.color} pip{c.hardest!.pips === 1 ? "" : "s"}: {pct(c.hardest!.chanceOnCurve)} chance to cast on curve.
          </p>
        ))}
      </div>
    </details>
  );
}

export function OverviewView({ v, a, pv, salty = [], folders = [] }: { v: LoadedDeck; a: Analysis; pv: PriceView; salty?: SaltyCard[]; folders?: string[] }) {
  const settings = (v.deck.settings ?? {}) as BuildSettings;
  const target = targetBracketOf(settings);
  const step = nextStep(v, { mustFix: a.advice.filter((x) => x.priority === 1).length });
  const deckSettings = (
    <section id="settings" className={`${panel} scroll-mt-28 space-y-4 p-4`} aria-label="Deck settings">
      <DeckActions
        deckId={v.deck.id}
        name={v.deck.name}
        status={v.deck.status}
        suggestUnowned={settings.suggestUnowned ?? true}
        maxPrice={settings.maxPrice}
        targetBracket={target}
        prices={pv}
        newLook
        shareToken={v.deck.shareToken}
        folder={v.deck.folder}
        pinned={v.deck.pinned}
        folders={folders}
      />
    </section>
  );
  // An empty deck (a new idea) gets its next step and its settings, not a page of empty charts.
  if (!v.cards.some((c) => c.board === "main")) {
    return (
      <div className="space-y-4">
        <Summary v={v} pv={pv} step={step} settings={settings} />
        <div className="grid min-w-0 gap-4 min-[900px]:grid-cols-2 min-[900px]:items-start">
          <div className="min-w-0 space-y-4">
            <p className={`${panel} p-4 text-sm text-muted`}>Health, the mana curve and the bracket show up here once the deck has cards.</p>
            {a.near.length > 0 && <Combos a={a} />}
            <DeckNotes deckId={v.deck.id} initial={v.deck.notes} />
          </div>
          <div className="min-w-0">{deckSettings}</div>
        </div>
        <DeckToast />
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <Summary v={v} pv={pv} step={step} settings={settings} />
      <div className="grid min-w-0 gap-4 min-[900px]:grid-cols-2 min-[900px]:items-start">
        <div className="min-w-0 space-y-4">
          <ToDo a={a} deckId={v.deck.id} />
          <Health a={a} />
        </div>
        <div className="min-w-0 space-y-4">
          <section id="curve" className={`${panel} scroll-mt-28 space-y-2 p-4`}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-lg font-semibold">Mana curve</h2>
              <span className="text-xs text-muted">Non-land cards, without the commander</span>
            </div>
            <div className="pt-4">
              <ManaCurve curve={a.stats.curve} showCounts barClassName="bg-[var(--accent-text)]/70" />
            </div>
          </section>
          <BracketPanel a={a} target={target} v={v} salty={salty} />
        </div>
      </div>
      <div className="grid min-w-0 gap-4 min-[900px]:grid-cols-2 min-[900px]:items-start">
        <div className="min-w-0 space-y-4">
          <Combos a={a} />
          <DeckNotes deckId={v.deck.id} initial={v.deck.notes} />
        </div>
        <div className="min-w-0 space-y-4">
          <PullList v={v} />
          <DeckTokens deckId={v.deck.id} />
          <Colours a={a} />
          <ManaBaseHelper deckId={v.deck.id} />
          {deckSettings}
        </div>
      </div>
      <DeckToast />
    </div>
  );
}
