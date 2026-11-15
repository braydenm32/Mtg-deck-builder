import Link from "next/link";
import { getDb } from "@/db/client";
import { dashboardStats } from "@/lib/collection/stats";

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
  const stats = await dashboardStats(await getDb());
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
          value={stats.lastSync ? new Date(stats.lastSync).toLocaleDateString("en-AU") : "never"}
        />
      </div>
      <div className="flex gap-3">
        <Link className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-fg" href="/import">
          Import cards
        </Link>
        <Link className="rounded-md border border-line px-4 py-2 text-sm" href="/collection">
          Browse collection
        </Link>
      </div>
    </div>
  );
}
