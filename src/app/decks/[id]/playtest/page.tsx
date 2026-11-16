import Image from "next/image";
import Link from "next/link";
import { Panel } from "@/components/ui";
import {
  goldfish,
  openingHand,
  rng,
  shuffledLibrary,
} from "@/lib/deck/goldfish";
import { isLand } from "@/lib/deck/text";
import { DrawOdds, type OddsPreset } from "@/components/deck/DrawOdds";
import { PlaytestEmpty, PlaytestView } from "@/components/deck/PlaytestView";
import { cardRoles, ROLE_LABELS, ROLES } from "@/lib/deck/roles";
import { currentLook } from "@/lib/look";
import { deckEntries, loadDeck } from "../data";

const pct = (n: number) => `${Math.round(n * 100)}%`;

export default async function Playtest({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ seed?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const seed = Number.parseInt(sp.seed ?? "", 10) || 1;
  const v = await loadDeck(id);
  const entries = deckEntries(v);
  const library = shuffledLibrary(entries, seed);
  const newLook = (await currentLook()) === "new";
  // An opening hand needs 7 cards; a deck that's still empty (a new idea) has nothing to draw.
  if (library.length < 7) {
    if (newLook) return <PlaytestEmpty deckId={v.deck.id} />;
    return (
      <Panel className="text-sm">
        Add at least 7 cards to the deck to playtest it.
      </Panel>
    );
  }
  const hand = openingHand(library, rng(seed));
  const sim = goldfish(entries, { games: 1000, turns: 6, seed: 7 });
  const lands = hand.hand.filter((c) => isLand(c)).length;
  const draws = hand.library.slice(0, 3);
  // The odds calculator's presets: how many cards of each role (and each of your tags) the 99 holds.
  const main = entries.filter((e) => e.board === "main");
  const presets: OddsPreset[] = [
    ...ROLES.map((r) => ({
      label: ROLE_LABELS[r],
      count: main
        .filter((e) => cardRoles(e.card).includes(r))
        .reduce((n, e) => n + e.quantity, 0),
    })),
    ...[...new Set(main.flatMap((e) => e.card.row?.tags ?? []))].map((t) => ({
      label: t,
      count: main
        .filter((e) => e.card.row?.tags?.includes(t))
        .reduce((n, e) => n + e.quantity, 0),
    })),
  ].filter((p) => p.count > 0);
  const odds = <DrawOdds library={library.length} presets={presets} />;
  if (newLook) {
    return (
      <div className="min-w-0 space-y-4">
        <PlaytestView
          seed={seed}
          hand={hand.hand.map((c) => ({
            name: c.name,
            imageNormal:
              "imageNormal" in c ? (c.imageNormal as string | null) : null,
          }))}
          lands={lands}
          mulligans={hand.mulligans}
          draws={draws.map((c) => c.name)}
          sim={sim}
        />
        {odds}
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <Panel className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">Sample opening hand</h2>
          <Link
            href={`?seed=${seed + 1}`}
            className="inline-flex min-h-11 items-center rounded-md bg-accent px-4 text-sm font-medium text-accent-fg"
            scroll={false}
          >
            New hand
          </Link>
        </div>
        <p className="text-sm text-muted">
          {lands} {lands === 1 ? "land" : "lands"}
          {hand.mulligans
            ? ` · after ${hand.mulligans} mulligan${hand.mulligans > 1 ? "s" : ""} (the first is free)`
            : " · a keep"}
        </p>
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-7">
          {hand.hand.map((c, i) => (
            <li
              key={`${c.name}-${i}`}
              className="relative aspect-[488/680] overflow-hidden rounded-[4.5%] bg-skeleton"
            >
              {"imageNormal" in c && c.imageNormal ? (
                <Image
                  src={c.imageNormal as string}
                  alt={c.name}
                  fill
                  sizes="(max-width: 640px) 33vw, 14vw"
                  className="object-cover"
                />
              ) : (
                <span className="flex h-full items-center justify-center p-2 text-center text-xs">
                  {c.name}
                </span>
              )}
            </li>
          ))}
        </ul>
        <p className="text-sm text-muted">
          Next draws: {draws.map((c) => c.name).join(", ")}
        </p>
      </Panel>

      <Panel className="space-y-2">
        <h2 className="font-semibold">Over 1,000 games (no opponent)</h2>
        <ul className="space-y-1 text-sm">
          <li>Mulligan at least once: {pct(sim.mulliganRate)}</li>
          <li>
            Average lands in the opening hand:{" "}
            {sim.averageLandsInOpeningHand.toFixed(1)}
          </li>
          {[2, 3, 4, 5].map((t) => (
            <li key={t}>
              Every land drop through turn {t}: {pct(sim.landDropsHit[t] ?? 0)},
              average {(sim.averageMana[t] ?? 0).toFixed(1)} mana
            </li>
          ))}
          {sim.commanderOnTurn && (
            <li>
              Commander castable (mana value {sim.commanderOnTurn.manaValue}) by
              turn {sim.commanderOnTurn.medianTurn ?? "—"} in half of games
            </li>
          )}
        </ul>
        <p className="text-xs text-muted">
          Plays a land each turn and casts ramp it can afford. Treasure, rituals
          and card draw aren’t modelled.
        </p>
      </Panel>
      {odds}
    </div>
  );
}
