"use client";

import { Badge } from "./ui";
import { CheckIcon, synergyPoints } from "./decks/bits";
import { GiveStatus, useGiveShared } from "./SharedCardActions";

type ChoiceDeck = { deckId: number; deckName: string; recommended: boolean; holds: boolean; synergy: number | null };

/**
 * One shared card on the Shared cards page: a box per deck that wants it, with its EDHREC synergy,
 * the better fit marked, and one tap to give the card to that deck.
 */
export function SharedCardChoice({
  oracleId,
  cardName,
  decks,
  fitLabel,
}: {
  oracleId: string;
  cardName: string;
  decks: ChoiceDeck[];
  /** "Better fit" when EDHREC synergy decided it, "Suggested" when there was none to go on. */
  fitLabel: string;
}) {
  const { give, busy, error, saved, disabled } = useGiveShared(oracleId, decks, cardName);
  return (
    <div className="space-y-2">
      <ul className="grid grid-cols-2 gap-2">
        {decks.map((d) => {
          const syn = synergyPoints(d.synergy);
          return (
            <li key={d.deckId} className={`flex min-w-0 flex-col gap-2 rounded-xl border p-2.5 ${d.recommended ? "border-accent/50" : "border-line"}`}>
              <div className="min-w-0 space-y-1">
                <p className="truncate text-sm font-medium">{d.deckName}</p>
                <p className="text-xs text-muted tabular-nums">
                  {syn ? (
                    <>
                      <span className={`text-sm font-semibold ${d.synergy! > 0 ? "text-ok" : "text-foreground"}`}>{syn}</span> synergy
                    </>
                  ) : (
                    "No EDHREC data"
                  )}
                </p>
                {d.recommended && <Badge tone="ok">{fitLabel}</Badge>}
              </div>
              <div className="mt-auto">
                {d.holds ? (
                  <p className="flex min-h-11 items-center gap-1.5 text-sm text-ok">
                    <CheckIcon />
                    Has your copy
                  </p>
                ) : (
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => give(d)}
                    className={`flex min-h-11 w-full items-center rounded-lg border px-3 py-1.5 text-left text-sm leading-tight hover:bg-background disabled:cursor-not-allowed disabled:opacity-50 ${
                      d.recommended ? "border-accent font-medium text-accent" : "border-line"
                    }`}
                  >
                    {busy === d.deckId ? "Moving…" : `Give to ${d.deckName}`}
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      <GiveStatus saved={saved} error={error} />
    </div>
  );
}
