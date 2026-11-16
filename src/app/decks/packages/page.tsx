import Link from "next/link";
import { getDb } from "@/db/client";
import { DeckToast } from "@/components/deck/DeckRowActions";
import { NewPackageForm } from "@/components/deck/Packages";
import { ColorPips } from "@/components/ui";
import { deckTags, listPackages } from "@/lib/deck/packages";

export const dynamic = "force-dynamic";

/** Card packages: groups of cards you put in decks again and again, each added to a deck in one tap. */
export default async function PackagesPage() {
  const db = await getDb();
  const [packages, tags] = await Promise.all([listPackages(db), deckTags(db)]);
  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="old-look-only text-2xl font-semibold">Card packages</h1>
      <p className="px-1 text-sm text-muted">A package is a group of cards you play together, like a removal suite, a land pack or a combo. Put one in any deck in one go.</p>
      {packages.length > 0 && (
        <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-panel">
          {packages.map((p) => (
            <li key={p.id}>
              <Link href={`/decks/packages/${p.id}`} className="flex min-h-16 items-center gap-3 px-4 py-2.5 hover:bg-(--panel-2)">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{p.name}</span>
                  <span className="block truncate text-xs text-muted">
                    {p.cards.length ? p.cards.slice(0, 4).map((c) => c.name).join(", ") + (p.cards.length > 4 ? ` and ${p.cards.length - 4} more` : "") : "No cards yet"}
                  </span>
                </span>
                <span className="flex shrink-0 flex-col items-end gap-1">
                  <span className="text-sm tabular-nums">{p.cards.length}</span>
                  {p.cards.length > 0 && <ColorPips identity={p.colorIdentity} />}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <NewPackageForm tags={tags} />
      <DeckToast />
    </div>
  );
}
