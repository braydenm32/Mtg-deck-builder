import Image from "next/image";
import Link from "next/link";
import { money } from "@/components/ui";
import { ownedText } from "@/components/CollectionList";
import type { CardAvailability } from "@/lib/collection/availability";
import type { CollectionCard } from "@/lib/collection/query";
import type { PriceView } from "@/lib/money";

/**
 * The Collection page as pictures: the same cards, order and selection as the rows, for browsing a
 * binder's worth at a glance. Each tile says how many you own and how many are free.
 */
export function CollectionGrid({ cards, availability, prices }: { cards: CollectionCard[]; availability: Map<string, CardAvailability>; prices: PriceView }) {
  return (
    <ul className="card-grid grid grid-cols-3 gap-2 sm:grid-cols-4 sm:gap-3 md:grid-cols-5 lg:grid-cols-6">
      {cards.map((c) => {
        const a = availability.get(c.oracleId);
        const price = money(c.value, prices);
        return (
          <li key={c.oracleId} data-oracle={c.oracleId} className="rounded-xl">
            <Link href={`/collection/${c.oracleId}`} className="group block rounded-xl p-0.5">
              <span className="relative block aspect-[488/680] overflow-hidden rounded-[4.5%] bg-skeleton">
                {c.image && (
                  <Image
                    src={c.image}
                    alt={c.name}
                    fill
                    sizes="(min-width: 1024px) 16vw, (min-width: 640px) 25vw, 33vw"
                    className="object-cover transition group-hover:scale-[1.02]"
                  />
                )}
                {c.quantity > 1 && (
                  <span className="absolute right-1.5 top-1.5 rounded-full bg-black/75 px-2 py-0.5 text-xs font-semibold text-white tabular-nums">×{c.quantity}</span>
                )}
              </span>
              <span className="mt-1 block truncate text-xs font-medium" title={c.name}>
                {c.name}
              </span>
              <span className="block truncate text-[11px] text-muted tabular-nums">
                {[a ? ownedText(a) : String(c.quantity), price].filter(Boolean).join(" · ")}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
