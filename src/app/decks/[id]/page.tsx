import { deckFolders } from "@/lib/deck/store";
import { getPriceView } from "@/lib/settings";
import { OverviewView } from "@/components/deck/OverviewView";
import { getDb } from "@/db/client";
import { edhrecCached } from "@/lib/edhrec/client";
import { parseSaltList, SALT_PATH, saltyCards } from "@/lib/edhrec/salt";
import { synergyReport } from "@/lib/deck/synergy-data";
import { analyze, loadDeck } from "./data";

export default async function DeckOverview({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const v = await loadDeck(id);
  const db = await getDb();
  const [a, pv, saltList, folders] = await Promise.all([analyze(v), getPriceView(), edhrecCached(db, SALT_PATH), deckFolders(db)]);
  // EDHREC's saltiest cards that this deck plays, for the Rule 0 card (the cached list only: never waits).
  const salty = saltyCards([...v.commanders, ...v.cards.filter((c) => c.board === "main")].map((c) => c.name), parseSaltList(saltList));
  // The synergy score for its panel (EDHREC's cached numbers only, so the page never waits on EDHREC).
  const synergy = v.cards.some((c) => c.board === "main") ? await synergyReport(db, v, a.combos) : undefined;
  return <OverviewView v={v} a={a} pv={pv} salty={salty} folders={folders} synergy={synergy} />;
}
