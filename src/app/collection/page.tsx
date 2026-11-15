import Image from "next/image";
import Link from "next/link";
import { getDb } from "@/db/client";
import { collectionSets, parseFilters, queryCollection } from "@/lib/collection/query";
import { CollectionFilters } from "@/components/CollectionFilters";
import { ColorPips, money } from "@/components/ui";

export const dynamic = "force-dynamic";

type SP = Record<string, string | string[] | undefined>;

function pageHref(sp: SP, page: number) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) if (typeof v === "string" && v && k !== "page") q.set(k, v);
  if (page > 1) q.set("page", String(page));
  const s = q.toString();
  return s ? `/collection?${s}` : "/collection";
}

export default async function CollectionPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const f = parseFilters(sp);
  const db = await getDb();
  const [result, sets] = await Promise.all([queryCollection(db, f), collectionSets(db)]);
  const { cards, totals, page, pages } = result;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-semibold">Collection</h1>
        <p className="text-sm text-muted tabular-nums">
          {totals.unique.toLocaleString()} cards · {totals.copies.toLocaleString()} copies · {money(totals.value)}
        </p>
      </div>
      <CollectionFilters f={f} sets={sets} />

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
                  {money(c.value)}
                  {c.foils > 0 && ` · ${c.foils} foil`}
                  {c.proxies > 0 && ` · ${c.proxies} proxy`}
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
