import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/db/client";
import { setCards } from "@/lib/collection/sets";

export const dynamic = "force-dynamic";

const chip = (on: boolean) =>
  `inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm ${on ? "border-accent bg-panel font-medium" : "border-line hover:bg-background"}`;

/** One set, card by card in collector-number order: the ones you have, and the gaps. ?show=missing|owned. */
export default async function SetPage({ params, searchParams }: { params: Promise<{ code: string }>; searchParams: Promise<{ show?: string }> }) {
  const { code } = await params;
  const show = (await searchParams).show;
  const set = await setCards(await getDb(), code);
  if (!set) notFound();
  const have = set.cards.filter((c) => c.owned > 0).length;
  const list = show === "missing" ? set.cards.filter((c) => !c.owned) : show === "owned" ? set.cards.filter((c) => c.owned) : set.cards;
  const base = `/collection/sets/${code}`;
  return (
    <div className="space-y-3">
      <section className="space-y-1 rounded-2xl border border-line bg-panel p-4">
        <h2 className="text-lg font-semibold">{set.name}</h2>
        <p className="text-sm text-muted tabular-nums">
          You have {have} of {set.cards.length} ({Math.round((have / set.cards.length) * 100)}%). {set.cards.length - have} to go.
        </p>
      </section>
      <nav aria-label="Show" className="flex gap-2">
        {[
          { key: undefined, label: "All" },
          { key: "missing", label: "Missing" },
          { key: "owned", label: "Have" },
        ].map((x) => (
          <Link key={x.label} href={x.key ? `${base}?show=${x.key}` : base} className={chip(show === x.key)} aria-current={show === x.key ? "page" : undefined} scroll={false}>
            {x.label}
          </Link>
        ))}
      </nav>
      <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
        {list.map((c) => (
          <li key={c.collectorNumber}>
            <Link href={c.owned ? `/collection/${c.oracleId}` : `/collection/add?q=${encodeURIComponent(c.name)}`} className="group block">
              <span className={`relative block aspect-[488/680] overflow-hidden rounded-[4.5%] bg-skeleton ${c.owned ? "" : "opacity-35 grayscale"}`}>
                {c.imageSmall && <Image src={c.imageSmall} alt={c.name} fill sizes="(min-width: 768px) 16vw, 33vw" className="object-cover" />}
                {c.owned > 1 && <span className="absolute right-1 top-1 rounded-full bg-foreground/85 px-1.5 text-[11px] font-semibold text-background tabular-nums">×{c.owned}</span>}
              </span>
              <span className="mt-0.5 block truncate text-xs">
                <span className="text-muted tabular-nums">#{c.collectorNumber}</span> {c.name}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
