/* eslint-disable @next/next/no-img-element */
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { getDb } from "@/db/client";
import { CopyText } from "@/components/share/CopyText";
import { ColorPips, ManaCost } from "@/components/ui";
import { BRACKETS } from "@/lib/deck/bracket";
import { sharedDeck, sharedDecklist } from "@/lib/deck/share";
import type { Bracket } from "@/lib/deck/bracket";

export const dynamic = "force-dynamic";

const PLURAL: Record<string, string> = { Sorcery: "Sorceries", Other: "Other" };
for (const t of ["Creature", "Planeswalker", "Battle", "Instant", "Artifact", "Enchantment", "Land"]) PLURAL[t] = `${t}s`;

const load = cache(async (token: string) => sharedDeck(await getDb(), token));

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const d = await load((await params).token);
  return { title: d ? `${d.name} · MTG Deck Tutor` : "MTG Deck Tutor", robots: { index: false, follow: false }, referrer: "no-referrer" };
}

/**
 * A deck's read-only link (src/lib/deck/share.ts): the commander and the list, for a friend or the
 * pod. Reachable without the password, so it shows nothing else: no notes, prices or locations.
 */
export default async function SharedDeckPage({ params }: { params: Promise<{ token: string }> }) {
  const d = await load((await params).token);
  if (!d) notFound();
  const bracket = BRACKETS[d.bracket as Bracket];
  return (
    <div className="space-y-5">
      <header className="flex gap-4">
        {d.commanders[0]?.imageNormal && (
          <img src={d.commanders[0].imageNormal} alt="" className="w-28 shrink-0 self-start rounded-[0.6rem] shadow-lg sm:w-36" />
        )}
        <div className="min-w-0 space-y-1.5">
          <p className="text-xs font-medium tracking-wide text-muted uppercase">Commander deck</p>
          <h1 className="font-[family-name:var(--font-sora)] text-2xl leading-tight font-bold">{d.name}</h1>
          <p className="text-[15px]">{d.commanders.map((c) => c.name).join(" + ")}</p>
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
            <ColorPips identity={d.colorIdentity} />
            <span>{d.count} cards</span>
            {bracket && <span>Built for Bracket {d.bracket} ({bracket.name})</span>}
          </p>
        </div>
      </header>

      <CopyText
        text={sharedDecklist(d)}
        label="Copy the decklist"
        className="inline-flex h-12 w-full items-center justify-center rounded-xl border border-line bg-panel px-4 text-base font-semibold sm:w-auto"
      />

      <div className="gap-4 space-y-4 sm:columns-2">
        {d.groups.map((g) => (
          <section key={g.type} className="break-inside-avoid overflow-hidden rounded-2xl border border-line bg-panel">
            <h2 className="flex items-baseline justify-between border-b border-line px-4 py-2 text-sm font-semibold">
              <span>{PLURAL[g.type] ?? g.type}</span>
              <span className="text-muted tabular-nums">{g.count}</span>
            </h2>
            <ul className="divide-y divide-line">
              {g.cards.map((c) => (
                <li key={c.name} className="flex min-h-10 items-center gap-2 px-4 py-1.5 text-[15px]">
                  <span className="w-5 shrink-0 text-right text-muted tabular-nums">{c.quantity}</span>
                  <span className="min-w-0 flex-1 truncate">{c.name}</span>
                  <ManaCost cost={c.manaCost} />
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
