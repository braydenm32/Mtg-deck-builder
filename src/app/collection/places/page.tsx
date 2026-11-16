import Link from "next/link";
import { getDb } from "@/db/client";
import { DeckToast } from "@/components/deck/DeckRowActions";
import { PlaceMenu } from "@/components/collection/PlaceMenu";
import { Badge, money } from "@/components/ui";
import { placesSummary } from "@/lib/collection/places";
import { getPriceView } from "@/lib/settings";

export const dynamic = "force-dynamic";

const plural = (n: number, one: string, many: string) => `${n.toLocaleString("en-AU")} ${n === 1 ? one : many}`;

/**
 * Every box and binder: how many cards, how many different ones, and what they're worth. A row opens
 * the collection filtered to that place (where you can also select cards to move or change); ⋯
 * renames it or merges it into another.
 */
export default async function PlacesPage() {
  const db = await getDb();
  const [{ places, needsHome }, pv] = await Promise.all([placesSummary(db), getPriceView()]);
  const menuPlaces = places.map((p) => ({ location: p.location, copies: p.copies }));

  if (!places.length && !needsHome) {
    return (
      <section className="mx-auto max-w-md space-y-3 rounded-2xl border border-line bg-panel p-6 text-center">
        <h2 className="text-xl font-semibold">No boxes or binders yet</h2>
        <p className="text-sm text-muted">When you add, import or scan cards, say which box or binder they go in, and each one shows here with its cards and value.</p>
        <Link href="/collection/add" className="inline-flex min-h-12 items-center justify-center rounded-xl bg-accent px-5 font-semibold text-accent-fg">
          Add cards
        </Link>
      </section>
    );
  }

  return (
    <div className="max-w-2xl space-y-3">
      <h1 className="old-look-only text-2xl font-semibold">Boxes and binders</h1>
      {needsHome > 0 && (
        <Link
          href="/collection?nohome=1"
          className="flex min-h-14 items-center justify-between gap-3 rounded-2xl border border-line bg-panel px-4 py-3 hover:bg-(--panel-2)"
        >
          <span className="min-w-0">
            <span className="block font-medium">
              <Badge tone="warn">Needs a home</Badge>
            </span>
            <span className="mt-1 block text-[13px] text-muted">{plural(needsHome, "card isn’t", "cards aren’t")} in a box or binder yet.</span>
          </span>
          <span aria-hidden className="text-muted">
            ›
          </span>
        </Link>
      )}
      <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-panel" aria-label="Your boxes and binders">
        {places.map((p) => {
          const value = money(p.value, pv);
          return (
            <li key={p.location} className="flex items-center gap-1 pr-1">
              <Link href={`/collection?loc=${encodeURIComponent(p.location)}`} className="flex min-h-16 min-w-0 flex-1 items-center justify-between gap-3 px-4 py-3 hover:bg-(--panel-2)">
                <span className="min-w-0">
                  <span className="block truncate font-medium">{p.location}</span>
                  <span className="block text-[13px] text-muted tabular-nums">
                    {plural(p.copies, "card", "cards")} · {p.cards.toLocaleString("en-AU")} different
                    {p.proxies > 0 ? ` · ${plural(p.proxies, "proxy", "proxies")}` : ""}
                  </span>
                </span>
                {value && <span className="shrink-0 text-sm font-semibold tabular-nums">{value}</span>}
              </Link>
              <PlaceMenu name={p.location} places={menuPlaces} />
            </li>
          );
        })}
      </ul>
      <p className="px-1 text-[13px] text-muted">Open a box or binder to see its cards, then tap Select to move or change several at once.</p>
      <DeckToast />
    </div>
  );
}
