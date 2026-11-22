import { DeckExport } from "@/components/deck/DeckExport";
import { DeviceDeck } from "@/components/offline/DeviceDeck";
import { deckVersion } from "@/lib/deck/version";
import { tabCounts } from "@/lib/offline/deck-model";
import { getDb } from "@/db/client";
import { inBackground } from "@/lib/background";
import { recordVersion } from "@/lib/deck/history";
import { loadDeck } from "./data";

export const dynamic = "force-dynamic";

export default async function DeckLayout({ params, children }: { params: Promise<{ id: string }>; children: React.ReactNode }) {
  const { id } = await params;
  const v = await loadDeck(id);
  // Keep a version for the deck's history when it changed since the last one (after the page has gone out).
  inBackground(async () => recordVersion(await getDb(), v.deck.id, "changes", { rows: v.cards }));
  // The top bar carries the deck's name, Back, the tabs and Export (src/lib/nav.ts). Only the
  // Overview carries the deck's summary (CALM 6), so the other tabs open straight on their content.
  // Upgrades also lists the cards this deck wants that sit in your other decks. While the deck has
  // edits waiting to send, DeviceDeck draws the bar's counts and the tab on the device.
  return (
    <div className="space-y-4">
      <DeviceDeck deckId={v.deck.id} version={deckVersion(v)} title={v.deck.name} counts={tabCounts(v)} actions={<DeckExport deckId={v.deck.id} name={v.deck.name} />}>
        {children}
      </DeviceDeck>
    </div>
  );
}
