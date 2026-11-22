import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { cards, collectionItems } from "@/db/schema";
import { DeckToast } from "@/components/deck/DeckRowActions";
import { PhoneNotifications } from "@/components/collection/PhoneNotifications";
import { AlertList, NewAlert } from "@/components/collection/PriceAlerts";
import { listAlerts } from "@/lib/prices/alerts";
import { getPriceView } from "@/lib/settings";

export const dynamic = "force-dynamic";

/**
 * Price alerts: the ones that went off, the ones still watching, a form for a new one (opened from a
 * card's Prices with ?card=), and notifications for this phone.
 */
export default async function AlertsPage({ searchParams }: { searchParams: Promise<{ card?: string }> }) {
  const { card } = await searchParams;
  const db = await getDb();
  const [alerts, pv, picked, mine] = await Promise.all([
    listAlerts(db),
    getPriceView(),
    card ? db.select({ oracleId: cards.oracleId, name: cards.name, custom: cards.custom }).from(cards).where(eq(cards.oracleId, card)) : [],
    card ? db.select({ id: collectionItems.id }).from(collectionItems).where(eq(collectionItems.oracleId, card)).limit(1) : [],
  ]);
  const initial = picked[0] && !picked[0].custom ? { oracleId: picked[0].oracleId, name: picked[0].name, owned: mine.length > 0 } : undefined;

  return (
    <div className="max-w-2xl space-y-3">
      {pv.hide && <p className="px-1 text-sm text-muted">Prices are turned off in Settings. Alerts still work, and show their prices here.</p>}
      <AlertList alerts={alerts} pv={pv} />
      <NewAlert key={initial?.oracleId ?? "none"} pv={pv} initial={initial} />
      <PhoneNotifications />
      <DeckToast />
    </div>
  );
}
