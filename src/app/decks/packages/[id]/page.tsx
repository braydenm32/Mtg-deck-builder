import { notFound } from "next/navigation";
import { getDb } from "@/db/client";
import { decks } from "@/db/schema";
import { DeckToast } from "@/components/deck/DeckRowActions";
import { PackageEditor } from "@/components/deck/Packages";
import { getPackage } from "@/lib/deck/packages";

export const dynamic = "force-dynamic";

/** One card package: its cards, and putting it in a deck. */
export default async function PackagePage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number.parseInt((await params).id, 10);
  const db = await getDb();
  const [pkg, deckList] = await Promise.all([
    Number.isFinite(id) ? getPackage(db, id) : undefined,
    db.select({ id: decks.id, name: decks.name, colorIdentity: decks.colorIdentity }).from(decks).orderBy(decks.name),
  ]);
  if (!pkg) notFound();
  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="font-[family-name:var(--font-sora)] px-1 text-2xl font-bold">{pkg.name}</h1>
      <PackageEditor pkg={pkg} decks={deckList} />
      <DeckToast />
    </div>
  );
}
