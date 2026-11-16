import { getDb } from "@/db/client";
import { DeckToast } from "@/components/deck/DeckRowActions";
import { GameList, LogGameForm, RecordPanel } from "@/components/deck/GameLog";
import { listGames, recordOf } from "@/lib/deck/games";
import { loadDeck } from "../data";

export const dynamic = "force-dynamic";

/** The deck's game log: log a game in a few taps, and see the record it adds up to. */
export default async function DeckGames({ params }: { params: Promise<{ id: string }> }) {
  const v = await loadDeck((await params).id);
  const games = await listGames(await getDb(), { deckId: v.deck.id });
  return (
    <div className="grid min-w-0 gap-4 min-[900px]:grid-cols-2 min-[900px]:items-start">
      <div className="min-w-0 space-y-4">
        <LogGameForm deckId={v.deck.id} />
      </div>
      <div className="min-w-0 space-y-3">
        {games.length > 0 ? (
          <>
            <RecordPanel record={recordOf(games)} />
            <GameList games={games} />
          </>
        ) : (
          <p className="rounded-2xl border border-line bg-panel p-4 text-sm text-muted">No games logged yet. Log each game after you play it, and this deck&rsquo;s record builds up here.</p>
        )}
      </div>
      <DeckToast />
    </div>
  );
}
