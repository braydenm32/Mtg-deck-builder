import Image from "next/image";
import Link from "next/link";
import { getDb } from "@/db/client";
import { CopyText } from "@/components/share/CopyText";
import { TradeCalc } from "@/components/collection/TradeCalc";
import { money } from "@/components/ui";
import { forTradeList } from "@/lib/collection/for-trade";
import { getPriceView } from "@/lib/settings";

export const dynamic = "force-dynamic";

const FINISH: Record<string, string> = { foil: "Foil", etched: "Etched" };

/**
 * Trades: the cards you've put on your for-trade list (from a card's copies, "Put on the for-trade
 * list"), with what they're worth and a copy-as-text for sharing, and a calculator for a trade at
 * the table.
 */
export default async function TradePage() {
  const [list, pv] = await Promise.all([forTradeList(await getDb()), getPriceView()]);
  const copies = list.reduce((n, l) => n + l.quantity, 0);
  const worth = list.reduce((n, l) => n + (l.priceUsd ?? 0) * l.quantity, 0);
  const text = list.map((l) => `${l.quantity} ${l.name} (${l.setCode.toUpperCase()}) ${l.collectorNumber}${l.finish === "nonfoil" ? "" : ` *${l.finish === "foil" ? "F" : "E"}*`}`).join("\n");

  return (
    <div className="max-w-2xl space-y-3">
      <h1 className="old-look-only text-2xl font-semibold">Trades</h1>
      <section className="space-y-3 rounded-2xl border border-line bg-panel p-4" aria-labelledby="ft-h">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="ft-h" className="text-lg font-semibold">
            For trade
          </h2>
          {list.length > 0 && (
            <CopyText text={text} label="Copy as text" className="inline-flex min-h-11 items-center rounded-lg border border-line px-3 text-sm font-medium hover:bg-background" />
          )}
        </div>
        {list.length === 0 ? (
          <p className="text-sm text-muted">
            Nothing yet. On a card&rsquo;s page, open a stack&rsquo;s &ldquo;⋯&rdquo; menu and choose &ldquo;Put on the for-trade list&rdquo;. You can also{" "}
            <Link href={`/collection?q=${encodeURIComponent("tag:trade")}`} className="font-medium text-accent">
              search with tag:trade
            </Link>
            .
          </p>
        ) : (
          <>
            <p className="text-sm text-muted">
              {copies.toLocaleString("en-AU")} {copies === 1 ? "copy" : "copies"}
              {!pv.hide && (
                <>
                  , worth <span className="font-semibold text-foreground tabular-nums">{money(worth, pv)}</span>
                </>
              )}
            </p>
            <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line">
              {list.map((l) => (
                <li key={l.itemId}>
                  <Link href={`/collection/${l.oracleId}`} className="flex min-h-14 items-center gap-3 px-3 py-2 hover:bg-(--panel-2)">
                    <span className="relative h-[42px] w-[30px] shrink-0 overflow-hidden rounded-[3px] bg-skeleton">
                      {l.imageSmall && <Image src={l.imageSmall} alt="" fill sizes="30px" className="object-cover" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">
                        {l.quantity > 1 && <span className="font-normal text-muted">{l.quantity}× </span>}
                        {l.name}
                      </span>
                      <span className="block text-[13px] text-muted">
                        {l.setCode.toUpperCase()} {l.collectorNumber}
                        {FINISH[l.finish] ? ` · ${FINISH[l.finish]}` : ""}
                        {l.location ? ` · ${l.location}` : ""}
                      </span>
                    </span>
                    {!pv.hide && <span className="shrink-0 text-sm tabular-nums">{money(l.priceUsd, pv)}</span>}
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <TradeCalc pv={pv} offers={list.map((l) => ({ oracleId: l.oracleId, name: l.name, priceUsd: l.priceUsd }))} />
    </div>
  );
}
