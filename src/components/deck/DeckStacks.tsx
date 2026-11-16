import Image from "next/image";
import Link from "next/link";
import type { DeckRow, LoadedDeck } from "@/app/decks/[id]/data";

/**
 * The deck as piles of cards, the way it looks spread out on a table: one pile per group (the same
 * groups as the list), each card showing its name strip, the last one in full. Hovering a card (or
 * focusing it) lifts it to the top. Each card opens its page. Cards you don't have yet are dimmed.
 */

type Pile = { key: string; title: string; rows: Pick<DeckRow, "id" | "oracleId" | "name" | "quantity" | "imageNormal" | "state" | "acquire">[] };

/** Card height is 680/488 of its width; a card below covers all but the top 14% (its name). */
const OVERLAP = "-119.8%";

export function DeckStacks({ v, piles }: { v: LoadedDeck; piles: Pile[] }) {
  const all: Pile[] = [
    ...(v.commanders.length
      ? [
          {
            key: "commander",
            title: v.commanders.length > 1 ? "Commanders" : "Commander",
            rows: v.commanders.map((c, i) => ({ id: -1 - i, oracleId: c.oracleId, name: c.name, quantity: 1, imageNormal: c.imageNormal, state: "placed" as const, acquire: null })),
          },
        ]
      : []),
    ...piles,
  ];
  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {all.map((p) => (
        <section key={p.key} aria-label={p.title} className="min-w-0">
          <h3 className="mb-2 truncate text-sm font-semibold">
            {p.title} <span className="font-normal text-muted tabular-nums">{p.rows.reduce((n, c) => n + c.quantity, 0)}</span>
          </h3>
          <ul>
            {p.rows.map((c, i) => {
              const away = c.state !== "placed";
              return (
                <li key={c.id} className="relative hover:z-10 focus-within:z-10" style={i < p.rows.length - 1 ? { marginBottom: OVERLAP } : undefined}>
                  <Link
                    href={`/collection/${c.oracleId}`}
                    className="relative block aspect-[488/680] overflow-hidden rounded-[4.75%] bg-skeleton shadow-[0_1px_4px_rgb(0_0_0/0.45)] outline-offset-2 transition-transform hover:-translate-y-1 focus-visible:-translate-y-1"
                    aria-label={`${c.quantity > 1 ? `${c.quantity} ` : ""}${c.name}${away ? (c.acquire === "proxy" ? ", to proxy" : ", to get") : ""}`}
                  >
                    {c.imageNormal ? (
                      <Image src={c.imageNormal} alt="" fill sizes="(min-width: 1280px) 200px, (min-width: 640px) 30vw, 45vw" className={`object-cover ${away ? "opacity-55" : ""}`} />
                    ) : (
                      <span className="absolute inset-x-2 top-2 text-xs font-medium">{c.name}</span>
                    )}
                    {(c.quantity > 1 || away) && (
                      <span className="absolute top-[3%] right-[4%] flex gap-1">
                        {away && <span className="rounded-md bg-background/90 px-1.5 py-0.5 text-[11px] font-semibold text-warn">{c.acquire === "proxy" ? "Proxy" : "To get"}</span>}
                        {c.quantity > 1 && <span className="rounded-md bg-background/90 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums">{c.quantity}×</span>}
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
