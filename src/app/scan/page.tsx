import type { Metadata } from "next";
import { desc, ne } from "drizzle-orm";
import { getDb } from "@/db/client";
import { decks } from "@/db/schema";
import { Scanner } from "@/components/scanner/Scanner";
import { currentLook } from "@/lib/look";
import { getPriceView } from "@/lib/settings";

export const metadata: Metadata = { title: "Scan cards · MTG Deck Tutor" };

/** `?into=deck:<id>` (a deck's "Scan cards into it") or `?into=wants` picks where scanned cards go. */
export default async function ScanPage({ searchParams }: { searchParams: Promise<{ into?: string }> }) {
  const db = await getDb();
  const [look, prices, deckList, sp] = await Promise.all([
    currentLook(),
    getPriceView(),
    db.select({ id: decks.id, name: decks.name }).from(decks).where(ne(decks.status, "retired")).orderBy(desc(decks.updatedAt)),
    searchParams,
  ]);
  const into = sp.into === "wants" || /^deck:\d+$/.test(sp.into ?? "") ? sp.into : undefined;
  return (
    <div className="space-y-3">
      {/* The new look's top bar already says "Add cards", with this page as the "Scan" tab. */}
      <h1 className="sr-only old-look-only">Scan cards</h1>
      <Scanner look={look} prices={prices} decks={deckList} initialInto={into} />
    </div>
  );
}
