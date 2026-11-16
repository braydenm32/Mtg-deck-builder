import { inArray } from "drizzle-orm";
import type { Db } from "@/db/client";
import { printings } from "@/db/schema";
import { money } from "@/components/ui";
import type { PriceView } from "@/lib/money";
import { finishPrice, printingHistory } from "@/lib/prices/daily";

const FINISH: Record<string, string> = { foil: "Foil", etched: "Etched", nonfoil: "" };
const DAYS = 30;

const euro = (n: number | null) => (n == null ? "—" : `€${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);

/**
 * Prices for the printings you own of a card: TCGplayer (in your currency), Cardmarket in euros as
 * Cardmarket lists them (not converted), and how the price moved over the last month.
 */
export async function CardPrices({ db, name, stacks, prices }: { db: Db; name: string; stacks: { printingId: string; finish: string }[]; prices: PriceView }) {
  if (prices.hide || !stacks.length) return null;
  const ids = [...new Set(stacks.map((s) => s.printingId))];
  const [rows, history] = await Promise.all([db.select().from(printings).where(inArray(printings.id, ids)), printingHistory(db, ids)]);
  const since = new Date(Date.now() - DAYS * 86_400_000).toISOString().slice(0, 10);
  const kinds = [...new Map(stacks.map((s) => [`${s.printingId}|${s.finish}`, s])).values()];
  const lines = kinds.flatMap((s) => {
    const p = rows.find((r) => r.id === s.printingId);
    if (!p) return [];
    const now = finishPrice({ usd: p.priceUsd, usdFoil: p.priceUsdFoil, usdEtched: p.priceUsdEtched }, s.finish);
    const first = history.find((h) => h.printingId === s.printingId && h.date > since);
    const was = first ? finishPrice({ usd: first.wasUsd, usdFoil: first.wasUsdFoil, usdEtched: first.wasUsdEtched }, s.finish) : null;
    const eur = s.finish === "nonfoil" ? (p.priceEur ?? p.priceEurFoil) : (p.priceEurFoil ?? p.priceEur);
    return [{ key: `${s.printingId}|${s.finish}`, label: [`${p.setCode.toUpperCase()} #${p.collectorNumber}`, FINISH[s.finish]].filter(Boolean).join(" · "), now, eur, change: now != null && was != null ? now - was : null }];
  });
  if (!lines.length) return null;
  const q = encodeURIComponent(name.split(" // ")[0]);

  return (
    <details className="group rounded-2xl border border-line bg-panel">
      <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-2 px-4">
        <h2 className="text-base font-semibold">Prices</h2>
        <span className="text-sm text-accent group-open:hidden">Show</span>
      </summary>
      <div className="space-y-3 px-4 pb-4 text-sm">
        <ul className="divide-y divide-line">
          {lines.map((l) => (
            <li key={l.key} className="flex items-start justify-between gap-3 py-2 first:pt-0">
              <span className="min-w-0">
                <span className="block truncate font-medium">{l.label}</span>
                {l.change != null && Math.abs(l.change) >= 0.01 && (
                  <span className="block text-[13px] text-muted tabular-nums">
                    {l.change > 0 ? "Up" : "Down"} {money(Math.abs(l.change), prices)} in the last {DAYS} days
                  </span>
                )}
              </span>
              <span className="shrink-0 text-right tabular-nums">
                <span className="block font-semibold">{money(l.now, prices)}</span>
                <span className="block text-[13px] text-muted">Cardmarket {euro(l.eur)}</span>
              </span>
            </li>
          ))}
        </ul>
        <p className="text-[13px] text-muted">
          TCGplayer and Cardmarket prices from Scryfall, checked daily. Euros are Cardmarket&rsquo;s own, not converted.{" "}
          <a href={`https://www.cardmarket.com/en/Magic/Products/Search?searchString=${q}`} target="_blank" rel="noreferrer" className="font-medium text-accent">
            Cardmarket
          </a>{" "}
          ·{" "}
          <a href={`https://www.tcgplayer.com/search/magic/product?q=${q}`} target="_blank" rel="noreferrer" className="font-medium text-accent">
            TCGplayer
          </a>
        </p>
      </div>
    </details>
  );
}
