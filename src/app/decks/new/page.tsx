import Link from "next/link";
import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db/client";
import { cards, collectionItems } from "@/db/schema";
import { NewDeckForm } from "@/components/NewDeckForm";

export const dynamic = "force-dynamic";

export default async function NewDeckPage({ searchParams }: { searchParams: Promise<{ commander?: string; theme?: string }> }) {
  const sp = await searchParams;
  const db = await getDb();
  const ownedIds = db.selectDistinct({ id: collectionItems.oracleId }).from(collectionItems);
  const owned = await db
    .select({ oracleId: cards.oracleId, name: cards.name, colorIdentity: cards.colorIdentity })
    .from(cards)
    .where(and(inArray(cards.oracleId, ownedIds), eq(cards.canBeCommander, true), eq(cards.legalCommander, "legal")))
    .orderBy(cards.name);
  const [initial] = sp.commander
    ? await db.select({ oracleId: cards.oracleId, name: cards.name, colorIdentity: cards.colorIdentity }).from(cards).where(eq(cards.oracleId, sp.commander))
    : [];
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Link href="/decks" className="inline-flex min-h-11 items-center text-sm text-muted hover:text-foreground">
        ← Decks
      </Link>
      <h1 className="text-2xl font-semibold">New deck</h1>
      <p className="text-sm text-muted">
        The builder fills the 99 from your collection first, and only suggests buying or proxying a card when you’re short.{" "}
        <Link className="text-accent underline" href="/decks/commanders">
          Not sure which commander? Start from a theme.
        </Link>
      </p>
      <NewDeckForm owned={owned} initial={{ commander: initial, theme: sp.theme }} />
    </div>
  );
}
