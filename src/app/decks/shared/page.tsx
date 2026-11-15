import Link from "next/link";
import { getDb } from "@/db/client";
import { Badge, money, Panel } from "@/components/ui";
import { SharedCardActions } from "@/components/SharedCardActions";
import { CHEAP_COPY_USD, sharedCards } from "@/lib/deck/allocate";
import { getPriceView } from "@/lib/settings";

export const dynamic = "force-dynamic";

const pct = (n: number | null) => (n === null ? "—" : `${n >= 0 ? "+" : ""}${Math.round(n * 100)}%`);

export default async function SharedCardsPage() {
  const [shared, pv] = await Promise.all([getDb().then(sharedCards), getPriceView()]);
  return (
    <div className="space-y-5">
      <Link href="/decks" className="inline-flex min-h-11 items-center text-sm text-muted hover:text-foreground">
        ← Decks
      </Link>
      <h1 className="text-2xl font-semibold">Shared cards</h1>
      <p className="text-sm text-muted">
        Cards that more of your active decks want than you have copies of. The recommended deck is where the card has the most synergy with the
        commander (EDHREC). Giving a card to a deck locks it there; decks still being built are rebuilt to fill the gap.
      </p>
      {shared.length > 0 && (
        <p className="text-sm">
          {shared.filter((s) => !s.settled).length} to decide · {shared.filter((s) => s.settled).length} already in the right deck
        </p>
      )}
      {shared.length === 0 ? (
        <Panel className="text-sm">No conflicts: every active deck has the copies it wants.</Panel>
      ) : (
        <ul className="space-y-3">
          {shared.map((s) => (
            <li key={s.oracleId}>
              <Panel className="space-y-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <Link href={`/collection/${s.oracleId}`} className="font-medium hover:underline">
                    {s.name}
                  </Link>
                  <span className="text-xs text-muted">
                    You own {s.copies} · {s.decks.length} decks want it
                  </span>
                </div>
                <ul className="text-sm">
                  {s.decks.map((d) => (
                    <li key={d.deckId} className="flex min-h-11 items-center justify-between gap-2 border-b border-line last:border-0">
                      <span className="flex min-w-0 items-center gap-2">
                        <Link className="truncate hover:underline" href={`/decks/${d.deckId}`}>
                          {d.deckName}
                        </Link>
                        {d.recommended && <Badge tone="ok">Recommended</Badge>}
                        {d.holds && <Badge>Has it now</Badge>}
                      </span>
                      <span className="shrink-0 text-xs text-muted">synergy {pct(d.synergy)}</span>
                    </li>
                  ))}
                </ul>
                {s.getAnother && (
                  <p className="text-sm text-muted">
                    {pv.hide
                      ? "It’s a cheap card: getting another copy may be easier than choosing."
                      : `It’s cheap (${money(s.priceUsd, pv)}, under ${money(CHEAP_COPY_USD, pv)}): getting another copy may be easier than choosing.`}
                  </p>
                )}
                {s.settled && <p className="text-sm text-ok">Already in the recommended deck. Move it only if you disagree.</p>}
                <SharedCardActions oracleId={s.oracleId} decks={s.decks} />
              </Panel>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
