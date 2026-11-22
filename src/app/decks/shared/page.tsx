import Image from "next/image";
import Link from "next/link";
import { getDb } from "@/db/client";
import { Badge, money } from "@/components/ui";
import { SharedCardChoice } from "@/components/SharedCardChoice";
import { ChevronIcon, fmt, joinAnd, plural } from "@/components/decks/bits";
import { CHEAP_COPY_USD, sharedCards, type SharedCard } from "@/lib/deck/allocate";
import { getPriceView } from "@/lib/settings";
import type { PriceView } from "@/lib/money";

export const dynamic = "force-dynamic";

/*
 * Shared cards (R6): cards more active decks want than you own copies of. Summary first, then one
 * row per card with the decks that want it, the better fit, and one tap to give it. Every number
 * comes from sharedCards(); this page only counts and orders what it returns.
 */

/** No deck has EDHREC synergy for this card, so the library's pick had nothing to go on but its own ranking. */
const noSynergy = (s: SharedCard) => s.decks.every((d) => d.synergy === null);

export default async function SharedCardsPage() {
  const [shared, pv] = await Promise.all([getDb().then(sharedCards), getPriceView()]);
  const toDecide = shared.filter((s) => !s.settled).length;
  const settled = shared.length - toDecide;
  const guessed = shared.filter(noSynergy).length;
  const cheap = shared.some((s) => s.getAnother);

  return (
    <div className="space-y-4">
      {shared.length === 0 ? (
        <section className="mx-auto max-w-md space-y-3 rounded-2xl border border-line bg-panel p-6 text-center">
          <h2 className="text-xl font-semibold">Nothing to share out</h2>
          <p className="text-sm text-muted">Every deck you’re building has the copies it wants. Ideas don’t hold copies, so they never compete for one.</p>
          <Link href="/decks" className="inline-flex min-h-11 items-center gap-1 text-sm text-muted hover:text-foreground">
            Back to my decks
            <ChevronIcon />
          </Link>
        </section>
      ) : (
        <div className="space-y-4 lg:grid lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start lg:gap-8 lg:space-y-0">
          {/* Summary first: above the list on a phone, beside it on a laptop. */}
          <aside className="space-y-2 lg:sticky lg:top-32 lg:col-start-2 lg:row-start-1 lg:rounded-2xl lg:border lg:border-line lg:bg-panel lg:p-5">
            <p className="flex flex-wrap items-baseline gap-x-2 text-muted">
              <span className="grad-text font-[family-name:var(--font-sora)] text-3xl font-bold tabular-nums">{fmt(toDecide)}</span>
              <span className="text-foreground">to decide</span>
              {settled > 0 && <span className="tabular-nums">· {fmt(settled)} settled</span>}
            </p>
            <p className="text-sm text-muted">
              {toDecide > 0
                ? "More of your decks want these cards than you have copies. Give each one to the deck marked for it, or to the other one."
                : "Each of these cards is already in the deck marked for it. Move one only if you disagree."}
            </p>
            {guessed > 0 && (
              <p className="text-sm text-muted">
                EDHREC has no synergy for {guessed === shared.length ? "any of these" : `${fmt(guessed)} of these`} in your decks yet, so{" "}
                {guessed === 1 ? "that one is" : "those are"} marked <span className="text-ok">Suggested</span>: the builder’s best guess. Pick the deck you
                play more.
              </p>
            )}
            <details className="group text-sm">
              <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-1 text-muted hover:text-foreground [&::-webkit-details-marker]:hidden">
                How the pick works
                <ChevronIcon className="transition-transform group-open:rotate-90" />
              </summary>
              <div className="space-y-2 pb-2 text-muted">
                <p>The better fit is the deck whose commander has the most synergy with the card on EDHREC. With no EDHREC data, the builder’s own ranking decides.</p>
                <p>Giving a card to a deck locks it there. Decks you’re still building are rebuilt to fill the gap; built decks keep their list.</p>
                <p>Only decks you’re building or have built hold copies. Ideas only want cards, so they never show up here.</p>
                {cheap && (
                  <p>
                    {pv.hide
                      ? "“Cheap to replace” marks a card whose cheapest printing costs very little: a second copy is often easier than choosing."
                      : `A green price is a second copy under ${money(CHEAP_COPY_USD, pv)}, at its cheapest printing: often easier than choosing.`}
                  </p>
                )}
              </div>
            </details>
          </aside>

          <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-panel lg:col-start-1 lg:row-start-1">
            {shared.map((s) => (
              <li key={s.oracleId}>
                <SharedRow s={s} pv={pv} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/**
 * One shared card. The deck boxes sit in the same place whether the card is settled or not, so
 * their "Saved" line survives the refresh that moves the card down the list.
 */
function SharedRow({ s, pv }: { s: SharedCard; pv: PriceView }) {
  const guess = noSynergy(s);
  const recommended = s.decks.filter((d) => d.recommended).map((d) => d.deckName);
  const price = s.getAnother ? money(s.priceUsd, pv) : null;
  return (
    <div className="space-y-3 p-3 sm:p-4 md:grid md:grid-cols-[minmax(0,15rem)_minmax(0,1fr)] md:items-start md:gap-4 md:space-y-0">
      <Link href={`/collection/${s.oracleId}`} className="flex min-h-11 min-w-0 items-start gap-3 rounded-lg hover:bg-background">
        <span className="relative aspect-[488/680] w-10 shrink-0 overflow-hidden rounded-[4.5%] bg-skeleton">
          {s.imageSmall && <Image src={s.imageSmall} alt="" fill sizes="40px" className="object-cover" />}
        </span>
        <span className="min-w-0 space-y-1">
          <span className="block truncate font-medium leading-snug">{s.name}</span>
          <span className="block text-sm text-muted tabular-nums">
            You own {fmt(s.copies)} · {fmt(s.decks.length)} {plural(s.decks.length, "deck wants", "decks want")} it
          </span>
          {s.getAnother && (
            <span className="block">
              <Badge tone="ok">{price ? `2nd copy ${price}` : "Cheap to replace"}</Badge>
            </span>
          )}
        </span>
      </Link>
      <div className="min-w-0 space-y-2">
        {s.settled && (
          <p className="text-sm text-muted">
            <span className="font-medium text-ok">Settled.</span> In {joinAnd(recommended)}, {guess ? "the suggested deck" : "the better fit"}.
          </p>
        )}
        <SharedCardChoice oracleId={s.oracleId} cardName={s.name} decks={s.decks} fitLabel={guess ? "Suggested" : "Better fit"} />
      </div>
    </div>
  );
}
