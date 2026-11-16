import { asc, eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { printings } from "@/db/schema";
import { Badge, money } from "@/components/ui";
import type { PriceView } from "@/lib/money";

/** Printings listed before "Show the other N". */
const SHOWN = 10;

const euro = (n: number | null) =>
  n == null
    ? null
    : `€${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * Every printing of the card, cheapest first, with its TCGplayer and Cardmarket prices: for picking
 * which copy to buy. The ones you own are marked. Read by the card's oracle ID (indexed).
 */
export async function AllPrintings({
  db,
  oracleId,
  owned,
  prices,
}: {
  db: Db;
  oracleId: string;
  owned: string[];
  prices: PriceView;
}) {
  const rows = await db
    .select({
      id: printings.id,
      setCode: printings.setCode,
      setName: printings.setName,
      collectorNumber: printings.collectorNumber,
      releasedAt: printings.releasedAt,
      usd: printings.priceUsd,
      usdFoil: printings.priceUsdFoil,
      usdEtched: printings.priceUsdEtched,
      eur: printings.priceEur,
      eurFoil: printings.priceEurFoil,
      lang: printings.lang,
    })
    .from(printings)
    .where(eq(printings.oracleId, oracleId))
    .orderBy(asc(printings.releasedAt));
  if (rows.length < 2) return null;
  const cheapestOf = (r: (typeof rows)[number]) =>
    [r.usd, r.usdFoil, r.usdEtched]
      .filter((x): x is number => x != null)
      .sort((a, b) => a - b)[0] ?? null;
  const list = prices.hide
    ? [...rows].reverse()
    : [...rows].sort(
        (a, b) =>
          (cheapestOf(a) ?? Infinity) - (cheapestOf(b) ?? Infinity) ||
          (b.releasedAt ?? "").localeCompare(a.releasedAt ?? ""),
      );
  const cheapest = prices.hide ? null : list.find((r) => cheapestOf(r) != null);
  const mine = new Set(owned);
  const PrintingList = ({ rows }: { rows: typeof list }) => (
    <ul className="divide-y divide-line">
      {rows.map((r) => (
        <li key={r.id} className="flex items-start justify-between gap-3 py-2">
          <span className="min-w-0">
            <span className="block truncate font-medium">{r.setName}</span>
            <span className="flex flex-wrap items-center gap-1.5 text-[13px] text-muted">
              <span>
                {r.setCode.toUpperCase()} #{r.collectorNumber}
                {r.releasedAt ? ` · ${r.releasedAt.slice(0, 4)}` : ""}
                {r.lang !== "en" ? ` · ${r.lang.toUpperCase()}` : ""}
              </span>
              {mine.has(r.id) && <Badge tone="ok">Yours</Badge>}
              {cheapest?.id === r.id && <Badge tone="accent">Cheapest</Badge>}
            </span>
          </span>
          {!prices.hide && (
            <span className="shrink-0 text-right tabular-nums">
              <span className="block font-semibold">
                {r.usd != null ? money(r.usd, prices) : "—"}
              </span>
              {(r.usdFoil ?? r.usdEtched) != null && (
                <span className="block text-[13px] text-muted">
                  Foil {money((r.usdFoil ?? r.usdEtched)!, prices)}
                </span>
              )}
              {euro(r.eur ?? r.eurFoil) && (
                <span className="block text-[13px] text-muted">
                  Cardmarket {euro(r.eur ?? r.eurFoil)}
                </span>
              )}
            </span>
          )}
        </li>
      ))}
    </ul>
  );

  return (
    <details className="group rounded-2xl border border-line bg-panel">
      <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-2 px-4">
        <h2 className="text-base font-semibold">
          Every printing{" "}
          <span className="font-normal text-muted tabular-nums">
            {rows.length}
          </span>
        </h2>
        <span className="text-sm text-accent group-open:hidden">Show</span>
      </summary>
      <div className="space-y-2 px-4 pb-4 text-sm">
        {!prices.hide && (
          <p className="text-[13px] text-muted">
            Cheapest first. Foil prices shown where a printing has them.
          </p>
        )}
        <PrintingList rows={list.slice(0, SHOWN)} />
        {list.length > SHOWN && (
          <details className="group/more">
            <summary className="inline-flex min-h-11 cursor-pointer list-none items-center text-sm font-medium text-accent group-open/more:hidden">
              Show the other {list.length - SHOWN}
            </summary>
            <PrintingList rows={list.slice(SHOWN)} />
          </details>
        )}
      </div>
    </details>
  );
}
