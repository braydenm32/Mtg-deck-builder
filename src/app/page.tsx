import Link from "next/link";
import { formatDate } from "@/lib/format";
import { getDb } from "@/db/client";
import { dashboardStats } from "@/lib/collection/stats";
import { Progress } from "@/components/ui";
import { sharedCards } from "@/lib/deck/allocate";
import { listDecks, STATUS_LABEL } from "@/lib/deck/store";

export const dynamic = "force-dynamic";

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-line bg-panel p-4">
      <div className="text-xs uppercase tracking-wide text-muted">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}

export default async function Home() {
  const db = await getDb();
  const [stats, decks, shared] = await Promise.all([dashboardStats(db), listDecks(db), sharedCards(db)]);
  const active = decks.filter((d) => d.status !== "retired").slice(0, 3);
  const toDecide = shared.filter((s) => !s.settled).length;
  const fmt = (n: number) => n.toLocaleString("en-AU");
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Your collection</h1>
      {stats.cards === 0 && (
        <p className="rounded-lg bg-warn-bg p-4 text-sm text-warn">
          The card database is empty. Run <code className="font-mono">npm run sync:cards</code> to download Scryfall&apos;s
          card data (about 30 seconds).
        </p>
      )}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Copies owned" value={fmt(stats.ownedCopies)} />
        <Stat label="Unique cards" value={fmt(stats.ownedUnique)} />
        <Stat label="Commander cards known" value={fmt(stats.cards)} />
        <Stat
          label="Card data from"
          value={stats.lastSync ? formatDate(stats.lastSync) : "never"}
        />
      </div>
      <div className="flex flex-wrap gap-3">
        <Link className="inline-flex min-h-11 items-center rounded-md bg-accent px-4 text-sm font-medium text-accent-fg" href="/import">
          Import cards
        </Link>
        <Link className="inline-flex min-h-11 items-center rounded-md border border-line px-4 text-sm" href="/collection">
          Browse collection
        </Link>
      </div>
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Your decks</h2>
          <Link className="inline-flex min-h-11 items-center rounded-md border border-line px-4 text-sm" href="/decks/new">
            Build a deck
          </Link>
        </div>
        {active.length === 0 ? (
          <p className="text-sm text-muted">No decks yet. Pick a commander you own and a theme, and the builder fills the 99 from your cards first.</p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-3">
            {active.map((d) => (
              <li key={d.id}>
                <Link href={`/decks/${d.id}`} className="block space-y-2 rounded-lg border border-line bg-panel p-3 hover:border-accent">
                  <p className="truncate font-medium">{d.name}</p>
                  <Progress value={d.progress.placed} max={d.progress.of} label={`${d.name} progress`} />
                  <p className="text-xs text-muted">
                    {STATUS_LABEL[d.status]} · {d.progress.placed}/{d.progress.of} in hand
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
        {toDecide > 0 && (
          <Link href="/decks/shared" className="inline-flex min-h-11 items-center text-sm text-accent underline">
            {toDecide} shared {toDecide === 1 ? "card needs" : "cards need"} a decision
          </Link>
        )}
      </section>
    </div>
  );
}
