import Link from "next/link";
import { getDb } from "@/db/client";
import { DeckToast } from "@/components/deck/DeckRowActions";
import { GameList } from "@/components/deck/GameLog";
import { deckRecords, listGames } from "@/lib/deck/games";

export const dynamic = "force-dynamic";

const pct = (n: number | null) => (n == null ? "—" : `${Math.round(n * 100)}%`);

/** Every deck's record side by side, and the games newest first. Games are logged from each deck. */
export default async function GameLogPage() {
  const db = await getDb();
  const [records, games] = await Promise.all([deckRecords(db), listGames(db, { limit: 100 })]);
  if (!records.length) {
    return (
      <section className="mx-auto max-w-md space-y-3 rounded-2xl border border-line bg-panel p-6 text-center">
        <h2 className="text-xl font-semibold">No games logged yet</h2>
        <p className="text-sm text-muted">Open a deck, then More › Games to log a game after you play it. Each deck&rsquo;s win rate shows up here.</p>
        <Link href="/decks" className="inline-flex min-h-11 items-center text-sm font-medium text-accent">
          Your decks
        </Link>
      </section>
    );
  }
  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="old-look-only text-2xl font-semibold">Game log</h1>
      <section className="overflow-hidden rounded-2xl border border-line bg-panel">
        <table className="w-full text-left text-sm">
          <thead className="text-xs text-muted">
            <tr>
              <th className="px-4 py-2 font-normal">Deck</th>
              <th className="px-2 py-2 text-right font-normal">Games</th>
              <th className="px-2 py-2 text-right font-normal">Wins</th>
              <th className="px-4 py-2 text-right font-normal">Win rate</th>
            </tr>
          </thead>
          <tbody>
            {records.map((r) => (
              <tr key={r.deckId} className="border-t border-line">
                <td className="max-w-0 px-4 py-2.5">
                  <Link href={`/decks/${r.deckId}/games`} className="block truncate font-medium hover:underline">
                    {r.name}
                  </Link>
                </td>
                <td className="px-2 text-right tabular-nums">{r.record.played}</td>
                <td className="px-2 text-right tabular-nums">{r.record.wins}</td>
                <td className="px-4 text-right font-semibold tabular-nums">{pct(r.record.winRate)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section className="space-y-2">
        <h2 className="px-1 text-lg font-semibold">Recent games</h2>
        <GameList games={games} showDeck />
      </section>
      <DeckToast />
    </div>
  );
}
