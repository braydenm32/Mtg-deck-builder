import Image from "next/image";
import Link from "next/link";
import { getDb } from "@/db/client";
import { cardAvailability } from "@/lib/collection/availability";
import { collectionSets, collectionTotals, parseFilters, queryCollection } from "@/lib/collection/query";
import { CollectionFilters } from "@/components/CollectionFilters";
import { CollectionList } from "@/components/CollectionList";
import { CollectionSearch } from "@/components/CollectionSearch";
import { ColorPips, money } from "@/components/ui";
import { currentLook } from "@/lib/look";
import { getPriceView } from "@/lib/settings";

export const dynamic = "force-dynamic";

type SP = Record<string, string | string[] | undefined>;

function pageHref(sp: SP, page: number) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) if (typeof v === "string" && v && k !== "page") q.set(k, v);
  if (page > 1) q.set("page", String(page));
  const s = q.toString();
  return s ? `/collection?${s}` : "/collection";
}

const plural = (n: number, one: string, many: string) => `${n.toLocaleString("en-AU")} ${n === 1 ? one : many}`;

export default async function CollectionPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const f = parseFilters(sp);
  const db = await getDb();
  const [result, sets, pv, look] = await Promise.all([queryCollection(db, f), collectionSets(db), getPriceView(), currentLook()]);
  const { cards, totals, page, pages } = result;

  if (look === "new") {
    // The new look: the top bar carries the title, so the page opens on the search.
    const [t, availability] = await Promise.all([collectionTotals(db, f), cardAvailability(db, cards.map((c) => c.oracleId))]);
    const narrowed = Boolean(f.ci || f.type || f.rarity || f.set || f.commander);
    const filtered = Boolean(f.q) || narrowed;
    const value = money(t.value, pv);
    const approx = t.estimated > 0 || t.unpriced > 0;

    if (t.copies === 0 && !filtered) {
      return (
        <section className="mx-auto max-w-md space-y-4 rounded-2xl border border-line bg-panel p-6 text-center">
          <h2 className="text-xl font-semibold">No cards yet</h2>
          <p className="text-sm text-muted">Add the cards you own, and this is where you&rsquo;ll check what you have, where it is, and whether a copy is free.</p>
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
            <Link href="/collection/add" className="inline-flex min-h-12 items-center justify-center rounded-xl bg-accent px-5 font-semibold text-accent-fg">
              Add cards
            </Link>
            <Link href="/import" className="inline-flex min-h-12 items-center justify-center rounded-xl border border-line px-5">
              Import a file
            </Link>
          </div>
        </section>
      );
    }

    const params = Object.fromEntries(Object.entries(sp).filter((e): e is [string, string] => typeof e[1] === "string"));
    // R1 · R2 · R3: one quiet line. "≈" links to the note that says which copies were estimated.
    // With nothing matching, the message below says so, and the line would only repeat it with zeros.
    const summary =
      t.copies === 0
        ? { counts: [], value: null, valueNote: null }
        : {
            counts: [plural(t.copies, "card", "cards"), t.proxies > 0 ? plural(t.proxies, "proxy", "proxies") : "", `${t.unique.toLocaleString("en-AU")} unique`].filter(Boolean),
            value: value && (approx ? `≈ ${value}` : value),
            valueNote: value && approx ? "#value-note" : null,
          };

    return (
      <CollectionSearch f={f} params={params} sets={sets} hidePrices={pv.hide} summary={summary}>
        {cards.length === 0 ? (
          <div className="space-y-3 rounded-2xl border border-dashed border-line p-6 text-center">
            <p>
              {f.q ? (
                <>
                  You don&rsquo;t own a card matching &ldquo;{f.q}&rdquo;{narrowed ? " with these filters" : ""}.
                </>
              ) : (
                "No cards match these filters."
              )}
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              <Link href="/collection" className="inline-flex min-h-11 items-center rounded-xl border border-line px-4 text-sm">
                Show all cards
              </Link>
              <Link
                href={f.q ? `/collection/add?q=${encodeURIComponent(f.q)}` : "/collection/add"}
                className="inline-flex min-h-11 items-center rounded-xl px-4 text-sm text-muted hover:text-foreground"
              >
                {f.q ? `Add “${f.q}”` : "Add a card"}
              </Link>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <CollectionList cards={cards} availability={availability} prices={pv} />
            {pages > 1 && (
              <nav aria-label="Pages" className="flex items-center justify-between gap-2">
                {page > 1 ? (
                  <Link className="inline-flex min-h-11 items-center rounded-xl border border-line px-4 text-sm" href={pageHref(sp, page - 1)}>
                    ← Previous
                  </Link>
                ) : (
                  <span className="inline-flex min-h-11 items-center px-4 text-sm text-muted opacity-50" aria-hidden>
                    ← Previous
                  </span>
                )}
                <span className="text-sm text-muted tabular-nums">
                  Page {page} of {pages}
                </span>
                {page < pages ? (
                  <Link className="inline-flex min-h-11 items-center rounded-xl border border-line px-4 text-sm" href={pageHref(sp, page + 1)}>
                    Next →
                  </Link>
                ) : (
                  <span className="inline-flex min-h-11 items-center px-4 text-sm text-muted opacity-50" aria-hidden>
                    Next →
                  </span>
                )}
              </nav>
            )}
            {value && approx && (
              <p id="value-note" className="text-xs text-muted">
                ≈{" "}
                {[
                  t.estimated > 0 && `${plural(t.estimated, "copy was", "copies were")} priced from a similar printing or another finish`,
                  t.unpriced > 0 && `${plural(t.unpriced, "copy has", "copies have")} no price yet and ${t.unpriced === 1 ? "isn’t" : "aren’t"} counted`,
                ]
                  .filter(Boolean)
                  .join("; ")}
                .
              </p>
            )}
          </div>
        )}
      </CollectionSearch>
    );
  }

  const total = money(totals.value, pv);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-semibold">Collection</h1>
        <p className="text-sm text-muted tabular-nums">
          {totals.unique.toLocaleString()} cards · {totals.copies.toLocaleString()} copies{total ? ` · ${total}` : ""}
        </p>
      </div>
      <CollectionFilters f={f} sets={sets} hidePrices={pv.hide} />

      {cards.length === 0 ? (
        <div className="rounded-lg border border-dashed border-line p-8 text-center text-sm text-muted">
          {totals.unique === 0 && !Object.keys(sp).length ? (
            <>
              Your collection is empty.{" "}
              <Link className="underline" href="/import">
                Import a CSV
              </Link>{" "}
              or{" "}
              <Link className="underline" href="/collection/add">
                add cards
              </Link>
              .
            </>
          ) : (
            "No cards match these filters."
          )}
        </div>
      ) : (
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 sm:gap-3 md:grid-cols-5 lg:grid-cols-6">
          {cards.map((c) => (
            <li key={c.oracleId}>
              <Link href={`/collection/${c.oracleId}`} className="group block">
                <div className="relative aspect-[488/680] overflow-hidden rounded-[4.5%] bg-skeleton">
                  {c.image && (
                    <Image
                      src={c.image}
                      alt={c.name}
                      fill
                      sizes="(min-width: 1024px) 16vw, (min-width: 640px) 25vw, 33vw"
                      className="object-cover transition group-hover:scale-[1.02]"
                    />
                  )}
                  <span className="absolute right-1.5 top-1.5 rounded-full bg-foreground/85 px-2 py-0.5 text-xs font-semibold text-background tabular-nums">
                    ×{c.quantity}
                  </span>
                </div>
                <div className="mt-1 flex min-w-0 items-center justify-between gap-1 text-xs">
                  <span className="truncate" title={c.name}>
                    {c.name}
                  </span>
                  <ColorPips identity={c.colorIdentity} />
                </div>
                <div className="text-xs text-muted tabular-nums">
                  {[money(c.value, pv), c.foils > 0 && `${c.foils} foil`, c.proxies > 0 && `${c.proxies} proxy`].filter(Boolean).join(" · ")}
                  {c.guessed > 0 && <span className="text-warn"> · printing guessed</span>}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {pages > 1 && (
        <nav className="flex items-center justify-center gap-4 text-sm">
          {page > 1 ? (
            <Link className="inline-flex min-h-11 items-center px-3" href={pageHref(sp, page - 1)}>
              ← Previous
            </Link>
          ) : (
            <span className="px-3 text-muted">← Previous</span>
          )}
          <span className="text-muted tabular-nums">
            Page {page} of {pages}
          </span>
          {page < pages ? (
            <Link className="inline-flex min-h-11 items-center px-3" href={pageHref(sp, page + 1)}>
              Next →
            </Link>
          ) : (
            <span className="px-3 text-muted">Next →</span>
          )}
        </nav>
      )}
    </div>
  );
}
