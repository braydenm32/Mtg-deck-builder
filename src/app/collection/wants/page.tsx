import Image from "next/image";
import Link from "next/link";
import { getDb } from "@/db/client";
import { BuyMissing } from "@/components/deck/BuyMissing";
import { DeckToast } from "@/components/deck/DeckRowActions";
import { Badge, money } from "@/components/ui";
import { WantAddCard, WantRemove } from "@/components/collection/WantControls";
import { shortOf, wantList } from "@/lib/collection/wants";
import { getPriceView } from "@/lib/settings";

export const dynamic = "force-dynamic";

const plural = (n: number, one: string, many: string) =>
  `${n.toLocaleString("en-AU")} ${n === 1 ? one : many}`;

/**
 * The want list: every card your decks need more copies of than you own, plus cards you add
 * yourself, in one place, so one order covers all of them. ?ideas=0 leaves out decks that are still
 * ideas.
 */
export default async function WantsPage({
  searchParams,
}: {
  searchParams: Promise<{ ideas?: string }>;
}) {
  const noIdeas = (await searchParams).ideas === "0";
  const [all, pv] = await Promise.all([
    wantList(await getDb()),
    getPriceView(),
  ]);
  const wants = noIdeas
    ? all
        .map((w) => {
          const decks = w.decks.filter((d) => d.status !== "idea");
          return {
            ...w,
            decks,
            needed: decks.reduce((n, d) => n + d.copies, 0),
            short: shortOf(w, decks),
          };
        })
        .filter((w) => w.short > 0)
    : all;
  const hasIdeas = all.some((w) => w.decks.some((d) => d.status === "idea"));
  const copies = wants.reduce((n, w) => n + w.short, 0);
  const cost = money(
    wants.reduce((n, w) => n + (w.priceUsd ?? 0) * w.short, 0),
    pv,
  );

  if (!wants.length) {
    return (
      <div className="mx-auto max-w-md space-y-3">
        <section className="space-y-3 rounded-2xl border border-line bg-panel p-6 text-center">
          <h2 className="text-xl font-semibold">Nothing to get</h2>
          <p className="text-sm text-muted">
            {noIdeas && hasIdeas
              ? "Your built and building decks have every card they need."
              : "Every card your decks use, you own enough copies of. Cards marked to proxy aren’t listed."}
          </p>
          {noIdeas && hasIdeas && (
            <Link
              href="/collection/wants"
              className="inline-flex min-h-11 items-center text-sm font-medium text-accent"
            >
              Include deck ideas
            </Link>
          )}
        </section>
        <WantAddCard />
        <DeckToast />
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-3">
      <h1 className="old-look-only text-2xl font-semibold">Want list</h1>
      <section className="space-y-1 rounded-2xl border border-line bg-panel p-4">
        <p className="text-lg font-semibold tabular-nums">
          {plural(copies, "card", "cards")} to get
          {cost ? (
            <span className="font-normal text-muted"> · about {cost}</span>
          ) : null}
        </p>
        <p className="text-sm text-muted">
          Cards your decks need more copies of than you own, and cards you’ve
          added. Cards marked to proxy aren’t here.
        </p>
        <div className="flex flex-wrap items-center gap-x-5">
          <BuyMissing
            lines={wants.map((w) => ({ name: w.name, quantity: w.short }))}
            currency={pv.currency}
          />
          {hasIdeas && (
            <Link
              href={noIdeas ? "/collection/wants" : "/collection/wants?ideas=0"}
              className="inline-flex min-h-11 items-center text-sm font-medium text-accent"
            >
              {noIdeas ? "Include deck ideas" : "Leave out deck ideas"}
            </Link>
          )}
        </div>
      </section>
      <WantAddCard />
      <ul
        className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-panel"
        aria-label="Cards to get"
      >
        {wants.map((w) => {
          const price =
            w.priceUsd != null ? money(w.priceUsd * w.short, pv) : null;
          return (
            <li
              key={w.oracleId}
              className={`flex min-h-[68px] items-center gap-3 py-2 pl-3 ${w.mine ? "pr-1" : "pr-3"}`}
            >
              <span className="relative h-[50px] w-9 shrink-0 overflow-hidden rounded-[3px] bg-skeleton">
                {w.imageSmall && (
                  <Image
                    src={w.imageSmall}
                    alt=""
                    fill
                    sizes="36px"
                    className="object-cover"
                  />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">
                  {w.short > 1 && (
                    <span className="font-normal text-muted">{w.short}× </span>
                  )}
                  {w.name}
                </span>
                <span className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[13px] text-muted">
                  {w.owned > 0 && w.needed > 0 && (
                    <span className="tabular-nums">
                      You own {w.owned} of {w.needed} ·
                    </span>
                  )}
                  {w.mine > 0 && (
                    <Badge tone="accent">
                      {w.mine > 1 ? `${w.mine} added by you` : "Added by you"}
                    </Badge>
                  )}
                  {w.decks.map((d, i) => (
                    <span
                      key={d.id}
                      className="inline-flex min-w-0 items-center gap-1"
                    >
                      <Link
                        href={`/decks/${d.id}/missing`}
                        className="truncate hover:text-foreground hover:underline"
                      >
                        {d.name}
                      </Link>
                      {d.status === "idea" && <Badge>Idea</Badge>}
                      {i < w.decks.length - 1 && <span aria-hidden>·</span>}
                    </span>
                  ))}
                </span>
              </span>
              {price && (
                <span className="shrink-0 text-sm font-semibold tabular-nums">
                  {price}
                </span>
              )}
              {w.mine > 0 && (
                <WantRemove
                  oracleId={w.oracleId}
                  name={w.name}
                  quantity={w.mine}
                />
              )}
            </li>
          );
        })}
      </ul>
      <DeckToast />
    </div>
  );
}
