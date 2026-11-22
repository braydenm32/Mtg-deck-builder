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
import { deckEntries, loadDeck } from "../data";

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
  // An opening hand needs 7 cards; a deck that's still empty (a new idea) has nothing to draw.
  if (library.length < 7) return <PlaytestEmpty deckId={v.deck.id} />;
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
      <DrawOdds library={library.length} presets={presets} />
    </div>
  );
}
