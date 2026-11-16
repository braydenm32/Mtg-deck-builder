import Image from "next/image";
import Link from "next/link";
import type { GoldfishResult } from "@/lib/deck/goldfish";

const pct = (n: number) => `${Math.round(n * 100)}%`;
const panel = "min-w-0 rounded-2xl border border-line bg-panel";

type Card = { name: string; imageNormal?: string | null };

/**
 * Playtest in the new look: a sample opening hand you can redraw (the seed stays in the URL, so Back
 * returns to the same hand), and the goldfish numbers as one compact table. Same numbers as the old tab.
 */
export function PlaytestView({
  seed,
  hand,
  lands,
  mulligans,
  draws,
  sim,
}: {
  seed: number;
  hand: Card[];
  lands: number;
  mulligans: number;
  draws: string[];
  sim: GoldfishResult;
}) {
  return (
    <div className="min-w-0 space-y-4">
      <section className={`${panel} space-y-4 p-4`} aria-labelledby="hand-h">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 id="hand-h" className="text-lg font-semibold">
              Opening hand
            </h2>
            <p className="text-sm text-muted">
              {lands} {lands === 1 ? "land" : "lands"}
              {mulligans ? ` · after ${mulligans} mulligan${mulligans > 1 ? "s" : ""} (the first is free)` : " · a keep"}
            </p>
          </div>
          <Link href={`?seed=${seed + 1}`} scroll={false} className="inline-flex min-h-11 items-center rounded-xl bg-accent px-5 text-sm font-semibold text-accent-fg">
            New hand
          </Link>
        </div>
        <ul className="grid grid-cols-4 gap-2 min-[600px]:grid-cols-7">
          {hand.map((c, i) => (
            <li key={`${c.name}-${i}`} className="relative aspect-[488/680] overflow-hidden rounded-[4.5%] bg-skeleton">
              {c.imageNormal ? (
                <Image src={c.imageNormal} alt={c.name} fill sizes="(max-width: 600px) 25vw, 14vw" className="object-cover" />
              ) : (
                <span className="flex h-full items-center justify-center p-1 text-center text-[11px]">{c.name}</span>
              )}
            </li>
          ))}
        </ul>
        {draws.length > 0 && (
          <div className="space-y-1.5">
            <h3 className="text-sm font-semibold text-muted">Next draws</h3>
            <ol className="flex flex-wrap gap-1.5 text-sm">
              {draws.map((d, i) => (
                <li key={`${d}-${i}`} className="rounded-lg border border-line px-2.5 py-1">
                  {d}
                </li>
              ))}
            </ol>
          </div>
        )}
        <Link href="board" className="inline-flex min-h-11 items-center text-sm font-medium text-accent">
          Play it out on the playtest board
        </Link>
      </section>

      <section className={`${panel} space-y-3 p-4`} aria-labelledby="sim-h">
        <div>
          <h2 id="sim-h" className="text-lg font-semibold">
            Over {sim.games.toLocaleString("en-AU")} games
          </h2>
          <p className="text-sm text-muted">No opponent. Plays a land each turn and casts ramp it can afford.</p>
        </div>
        <div className="grid min-w-0 gap-x-8 gap-y-3 min-[900px]:grid-cols-2 min-[900px]:items-start">
          <dl className="divide-y divide-line text-sm">
            <div className="flex min-h-10 items-center justify-between gap-3">
              <dt className="text-muted">Mulligan at least once</dt>
              <dd className="font-semibold tabular-nums">{pct(sim.mulliganRate)}</dd>
            </div>
            <div className="flex min-h-10 items-center justify-between gap-3">
              <dt className="text-muted">Lands in the opening hand</dt>
              <dd className="font-semibold tabular-nums">{sim.averageLandsInOpeningHand.toFixed(1)} on average</dd>
            </div>
            {sim.commanderOnTurn && (
              <div className="flex min-h-10 items-center justify-between gap-3">
                <dt className="text-muted">Commander castable (mana value {sim.commanderOnTurn.manaValue}) in half of games</dt>
                <dd className="shrink-0 font-semibold tabular-nums">by turn {sim.commanderOnTurn.medianTurn ?? "—"}</dd>
              </div>
            )}
          </dl>
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-muted">
              <tr className="border-b border-line">
                <th className="py-2 font-normal">By turn</th>
                <th className="py-2 text-right font-normal">Every land drop</th>
                <th className="py-2 text-right font-normal">Average mana</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {[2, 3, 4, 5].map((t) => (
                <tr key={t} className="border-b border-line last:border-0">
                  <td className="py-2">{t}</td>
                  <td className="py-2 text-right">{pct(sim.landDropsHit[t] ?? 0)}</td>
                  <td className="py-2 text-right">{(sim.averageMana[t] ?? 0).toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-muted">Treasure, rituals and card draw aren’t modelled.</p>
      </section>
    </div>
  );
}

/** A deck too small to draw an opening hand from. */
export function PlaytestEmpty({ deckId }: { deckId: number }) {
  return (
    <div className={`${panel} p-4`}>
      <p className="font-semibold">Not enough cards to playtest</p>
      <p className="text-sm text-muted">An opening hand needs at least 7 cards in the deck.</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <Link className="inline-flex min-h-11 items-center rounded-xl border border-line px-4 text-sm font-medium hover:bg-background" href={`/decks/${deckId}`}>
          Build it from your cards
        </Link>
        <Link className="inline-flex min-h-11 items-center rounded-xl px-3 text-sm font-medium text-accent" href={`/decks/${deckId}/cards`}>
          Add cards
        </Link>
      </div>
    </div>
  );
}
