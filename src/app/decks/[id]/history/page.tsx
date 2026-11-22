import { getDb } from "@/db/client";
import { DeckToast } from "@/components/deck/DeckRowActions";
import { RestoreVersion } from "@/components/deck/RestoreVersion";
import { Badge } from "@/components/ui";
import { formatDateTime } from "@/lib/format";
import { listVersions, rowsHash, snapshotRows, type Version } from "@/lib/deck/history";
import { loadDeck } from "../data";

export const dynamic = "force-dynamic";

const REASON: Record<Version["reason"], string | null> = { changes: null, "before-rebuild": "Before a rebuild", "before-restore": "Before a restore" };

/** "2 Sol Ring, Mana Crypt and 3 more". */
function names(list: { name: string; quantity: number }[], max = 6) {
  const shown = list.slice(0, max).map((c) => (c.quantity > 1 ? `${c.quantity} ${c.name}` : c.name));
  return list.length > max ? `${shown.join(", ")} and ${list.length - max} more` : shown.join(", ");
}

/**
 * The deck's history: each version kept (when it changed, and before every rebuild or restore),
 * what changed in the main deck, and Restore to put any of them back.
 */
export default async function DeckHistory({ params }: { params: Promise<{ id: string }> }) {
  const v = await loadDeck((await params).id);
  const versions = await listVersions(await getDb(), v.deck.id, rowsHash(snapshotRows(v.cards)));
  if (versions.length <= 1 && !versions.some((x) => !x.current)) {
    return (
      <div className="space-y-3">
        <p className="rounded-2xl border border-line bg-panel p-4 text-sm text-muted">
          No earlier versions yet. From now on, the deck is kept each time it changes and before every rebuild, so you can go back to any of them here.
        </p>
      </div>
    );
  }
  return (
    <div className="max-w-2xl space-y-3">
      <p className="px-1 text-sm text-muted">The deck is kept each time it changes (changes within an hour count as one) and before every rebuild. Restore puts the main deck and Maybe list back; your commander stays.</p>
      <ol className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-panel">
        {versions.map((x, i) => (
          <li key={x.id} className="flex items-start gap-3 py-3 pr-1 pl-4">
            <div className="min-w-0 flex-1 space-y-1">
              <p className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{formatDateTime(x.at)}</span>
                {x.current && <Badge tone="ok">Now</Badge>}
                {REASON[x.reason] && <Badge>{REASON[x.reason]}</Badge>}
              </p>
              <p className="text-[13px] text-muted tabular-nums">{x.cards} cards in the main deck</p>
              {x.added.length > 0 && (
                <p className="text-sm">
                  <span className="font-semibold text-ok">+{x.added.reduce((n, c) => n + c.quantity, 0)}</span> {names(x.added)}
                </p>
              )}
              {x.removed.length > 0 && (
                <p className="text-sm">
                  <span className="font-semibold text-danger">−{x.removed.reduce((n, c) => n + c.quantity, 0)}</span> {names(x.removed)}
                </p>
              )}
              {i === versions.length - 1 && <p className="text-[13px] text-muted">The first version kept.</p>}
            </div>
            {!x.current && <RestoreVersion deckId={v.deck.id} versionId={x.id} label={formatDateTime(x.at)} />}
          </li>
        ))}
      </ol>
      <DeckToast />
    </div>
  );
}
