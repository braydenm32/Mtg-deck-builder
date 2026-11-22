import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db/client";
import { cards, collectionItems } from "@/db/schema";
import { NewDeckForm } from "@/components/NewDeckForm";
import { TopBar } from "@/components/shell/TopBar";
import { THEMES } from "@/lib/deck/themes";

export const dynamic = "force-dynamic";

/**
 * New deck: commander, then theme, then build. `?commander=<oracleId>&theme=<slug>` pre-fills the
 * form (Find a commander and a card's "Build a deck around it" link here), and the form keeps both
 * in the address as you choose, so a reload or Back keeps them.
 */
export default async function NewDeckPage({ searchParams }: { searchParams: Promise<{ commander?: string; theme?: string }> }) {
  const sp = await searchParams;
  const db = await getDb();
  const option = { oracleId: cards.oracleId, name: cards.name, colorIdentity: cards.colorIdentity, imageSmall: cards.imageSmall };
  const ownedIds = db.selectDistinct({ id: collectionItems.oracleId }).from(collectionItems);
  const [owned, [initial]] = await Promise.all([
    db
      .select(option)
      .from(cards)
      .where(and(inArray(cards.oracleId, ownedIds), eq(cards.canBeCommander, true), eq(cards.legalCommander, "legal")))
      .orderBy(cards.name),
    sp.commander ? db.select(option).from(cards).where(eq(cards.oracleId, sp.commander)) : Promise.resolve([]),
  ]);
  return (
    <div className="space-y-4">
      {/* A child page: the top bar says "New deck", and Back goes to My decks. It spans the page, so it sits outside the narrow column. */}
      <TopBar inPage title="New deck" />
      <div className="mx-auto max-w-2xl space-y-4">
        <p className="text-sm text-muted">The builder fills the 99 from your cards first, and only suggests buying or proxying a card when you’re short.</p>
        <NewDeckForm owned={owned} initial={{ commander: initial, theme: sp.theme }} builtInThemes={THEMES.map((t) => ({ slug: t.slug, label: t.label }))} />
      </div>
    </div>
  );
}
