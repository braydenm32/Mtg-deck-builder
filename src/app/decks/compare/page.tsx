import Link from "next/link";
import { desc } from "drizzle-orm";
import { getDb } from "@/db/client";
import { decks } from "@/db/schema";
import { compareDecks, type DeckCompare } from "@/lib/deck/compare";
import { getDeck } from "@/lib/deck/store";

export const dynamic = "force-dynamic";

const SELECT = "h-12 w-full rounded-md border border-line bg-panel px-3 text-base md:h-11 md:text-sm";

/**
 * Compare two of your decks: pick them (kept in the address, ?a=&b=), then see their numbers side
 * by side, the cards both play, and what each plays alone. compareDecks() does the sums.
 */
export default async function CompareDecksPage({ searchParams }: { searchParams: Promise<{ a?: string; b?: string }> }) {
  const sp = await searchParams;
  const db = await getDb();
  const list = await db.select({ id: decks.id, name: decks.name }).from(decks).orderBy(desc(decks.updatedAt));
  const ids = new Set(list.map((d) => d.id));
  const pick = (s?: string) => {
    const n = Number.parseInt(s ?? "", 10);
    return ids.has(n) ? n : undefined;
  };
  const a = pick(sp.a) ?? list[0]?.id;
  const b = pick(sp.b) ?? list.find((d) => d.id !== a)?.id;
  const [va, vb] = a && b && a !== b ? await Promise.all([getDeck(db, a), getDeck(db, b)]) : [];
  const result = va && vb ? compareDecks(va, vb) : undefined;

  return (
    <div className="max-w-3xl space-y-4">
      {list.length < 2 ? (
        <section className="mx-auto max-w-md space-y-3 rounded-2xl border border-line bg-panel p-6 text-center">
          <h2 className="text-xl font-semibold">Two decks needed</h2>
          <p className="text-sm text-muted">Once you have a second deck, you can see them side by side here.</p>
          <Link href="/decks/new" className="inline-flex min-h-11 items-center text-sm font-medium text-accent">
            New deck
          </Link>
        </section>
      ) : (
        <>
          <form className="grid items-end gap-3 rounded-2xl border border-line bg-panel p-4 sm:grid-cols-[1fr_1fr_auto]" action="/decks/compare">
            <label className="space-y-1 text-sm">
              <span className="font-medium">First deck</span>
              <select name="a" defaultValue={a} className={SELECT}>
                {list.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-sm">
              <span className="font-medium">Second deck</span>
              <select name="b" defaultValue={b} className={SELECT}>
                {list.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" className="inline-flex min-h-11 items-center justify-center rounded-lg bg-accent px-4 text-sm font-semibold text-accent-fg hover:opacity-90">
              Compare
            </button>
          </form>
          {a === b && <p className="text-sm text-muted">Pick two different decks.</p>}
          {result && <Comparison r={result} />}
        </>
      )}
    </div>
  );
}

function Comparison({ r }: { r: DeckCompare }) {
  const show = (n: number, decimal?: boolean) => (decimal ? n.toFixed(2) : String(n));
  const far = (l: DeckCompare["lines"][number]) => Math.abs(l.a - l.b) >= (l.decimal ? 0.3 : 3);
  return (
    <>
      <section className="overflow-hidden rounded-2xl border border-line bg-panel" aria-label="Side by side">
        <table className="w-full table-fixed text-left text-sm">
          <thead>
            <tr>
              <th className="w-[40%] px-4 py-3 text-xs font-normal text-muted" />
              {[r.a, r.b].map((d) => (
                <th key={d.id} className="px-2 py-3 text-right align-bottom last:pr-4">
                  <Link href={`/decks/${d.id}`} className="line-clamp-2 font-semibold break-words hover:underline">
                    {d.name}
                  </Link>
                  <span className="line-clamp-2 text-xs font-normal break-words text-muted">{d.commanders.join(" + ")}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {r.lines.map((l) => (
              <tr key={l.label} className="border-t border-line">
                <td className="px-4 py-2">{l.label}</td>
                <td className={`px-2 text-right tabular-nums ${far(l) && l.a > l.b ? "font-semibold" : ""}`}>{show(l.a, l.decimal)}</td>
                <td className={`px-2 pr-4 text-right tabular-nums ${far(l) && l.b > l.a ? "font-semibold" : ""}`}>{show(l.b, l.decimal)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <p className="px-1 text-xs text-muted">Bold marks a clear difference. Commanders count toward the cards; basic lands aren&rsquo;t compared below.</p>

      <section className="space-y-2 rounded-2xl border border-line bg-panel p-4" aria-labelledby="shared-h">
        <h2 id="shared-h" className="text-lg font-semibold">
          In both <span className="font-normal text-muted tabular-nums">{r.shared.length}</span>
        </h2>
        {r.shared.length ? (
          <>
            <p className="text-sm">{r.shared.join(", ")}</p>
            <p className="text-xs text-muted">
              One copy can only sit in one deck you&rsquo;re playing. <Link href="/decks/shared" className="font-medium text-accent">Shared cards</Link> helps decide
              which deck keeps it.
            </p>
          </>
        ) : (
          <p className="text-sm text-muted">No cards in common, basic lands aside.</p>
        )}
      </section>

      {[
        { d: r.a, cards: r.onlyA },
        { d: r.b, cards: r.onlyB },
      ].map(({ d, cards }) => (
        <details key={d.id} className="group rounded-2xl border border-line bg-panel p-4">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 [&::-webkit-details-marker]:hidden">
            <span className="min-w-0 truncate text-lg font-semibold">
              Only in {d.name} <span className="font-normal text-muted tabular-nums">{cards.length}</span>
            </span>
            <span className="shrink-0 text-sm text-accent group-open:hidden">Show</span>
          </summary>
          <p className="pt-1 text-sm">{cards.length ? cards.join(", ") : "Nothing: every card is in the other deck too."}</p>
        </details>
      ))}
    </>
  );
}
