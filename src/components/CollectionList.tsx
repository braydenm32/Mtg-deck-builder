import Image from "next/image";
import Link from "next/link";
import { Badge, ColorPips, money } from "@/components/ui";
import type { CardAvailability } from "@/lib/collection/availability";
import type { CollectionCard } from "@/lib/collection/query";
import type { PriceView } from "@/lib/money";

/** R4 in words: "1 · free", "3 · all free", "3 · 1 free", "1 · in Toph Earthbending", "2 · in 2 decks". */
export function ownedText(a: Pick<CardAvailability, "owned" | "free" | "decks">): string {
  if (a.free <= 0) return `${a.owned} · in ${a.decks.length === 1 ? a.decks[0].name : `${a.decks.length} decks`}`;
  if (a.free >= a.owned) return a.owned === 1 ? "1 · free" : `${a.owned} · all free`;
  return `${a.owned} · ${a.free} free`;
}

/** Where the copies live: the one place, or "3 places". Empty means they need a home. */
function Where({ a }: { a: CardAvailability }) {
  if (a.places.length > 1) return <>{a.places.length} places</>;
  const place = a.places[0]?.location ?? "";
  return place ? <>{place}</> : <Badge tone="warn">Needs a home</Badge>;
}

/** Chips for the things worth a second look: a proxy, a guessed printing, decks that want it. */
function Chips({ c, a }: { c: CollectionCard; a: CardAvailability }) {
  return (
    <>
      {a.proxies > 0 && <Badge>{a.proxies === 1 ? "proxy" : `${a.proxies} proxies`}</Badge>}
      {c.guessed > 0 && <Badge tone="warn">printing guessed</Badge>}
      {a.wantedBy.length > 0 && <Badge tone="accent">{a.wantedBy.length === 1 ? `${a.wantedBy[0].name} wants it` : `${a.wantedBy.length} decks want it`}</Badge>}
    </>
  );
}

const Dot = () => (
  <span aria-hidden className="opacity-60">
    ·
  </span>
);

/**
 * The Collection page's rows in the new look. Each row answers the lookup on its own: how many you
 * own, how many are free, and where they are, so the card page is only for details.
 */
export function CollectionList({ cards, availability, prices }: { cards: CollectionCard[]; availability: Map<string, CardAvailability>; prices: PriceView }) {
  // A fixed price column keeps the other columns lined up from row to row.
  const cols = prices.hide
    ? "md:grid-cols-[36px_minmax(0,1.6fr)_minmax(0,1.2fr)_minmax(0,0.8fr)]"
    : "md:grid-cols-[36px_minmax(0,1.6fr)_minmax(0,1.2fr)_minmax(0,0.8fr)_6.5rem]";
  return (
    <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-panel">
      {cards.map((c) => {
        const a = availability.get(c.oracleId) ?? { owned: c.quantity, proxies: c.proxies, inDecks: 0, free: c.quantity, decks: [], wantedBy: [], commanderOf: [], places: [] };
        const price = money(c.value, prices);
        const foil = c.foils > 0 ? (c.foils === c.quantity ? "foil" : `${c.foils} foil`) : null;
        return (
          <li key={c.oracleId} data-oracle={c.oracleId}>
            <Link
              href={`/collection/${c.oracleId}`}
              className={`grid min-h-[68px] grid-cols-[36px_minmax(0,1fr)_auto] items-center gap-x-3 px-3 py-2 hover:bg-(--panel-2) md:gap-x-5 md:px-4 ${cols}`}
            >
              <span className="relative h-[50px] w-9 overflow-hidden rounded-[3px] bg-skeleton">
                {c.imageSmall && <Image src={c.imageSmall} alt="" fill sizes="36px" className="object-cover" />}
              </span>
              <span className="min-w-0">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="truncate font-medium">{c.name}</span>
                  {c.colorIdentity && <ColorPips identity={c.colorIdentity} />}
                </span>
                {/* Phone: one quiet line with the whole answer. */}
                <span className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[13px] text-muted md:hidden">
                  <span className="tabular-nums">{ownedText(a)}</span>
                  {foil && (
                    <>
                      <Dot />
                      <span>{foil}</span>
                    </>
                  )}
                  <Dot />
                  <span className="min-w-0 truncate">
                    <Where a={a} />
                  </span>
                  <Chips c={c} a={a} />
                </span>
                <span className="mt-0.5 hidden truncate text-[13px] text-muted md:block">{c.typeLine}</span>
              </span>
              {/* Laptop: the same answer in columns. */}
              <span className="hidden flex-wrap items-center gap-x-1.5 gap-y-1 text-sm md:flex">
                <span className="tabular-nums">{ownedText(a)}</span>
                {foil && (
                  <>
                    <Dot />
                    <span className="text-muted">{foil}</span>
                  </>
                )}
                <Chips c={c} a={a} />
              </span>
              <span className="hidden min-w-0 truncate text-sm text-muted md:block">
                <Where a={a} />
              </span>
              {price && <span className="text-right text-sm font-semibold tabular-nums">{price}</span>}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
