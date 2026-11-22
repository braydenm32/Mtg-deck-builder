import { desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db/client";
import { decks, games } from "@/db/schema";

/** The game log: games played with each deck, and its win rate against an even share of the pod. */

export type Game = typeof games.$inferSelect;
export type GameResult = Game["result"];

export const logGameSchema = z.object({
  playedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  result: z.enum(["win", "loss", "draw"]),
  players: z.number().int().min(2).max(8).default(4),
  turns: z.number().int().min(1).max(60).nullable().optional(),
  notes: z.string().trim().max(500).default(""),
});
export type LogGame = z.infer<typeof logGameSchema>;

export async function logGame(db: Db, deckId: number, input: LogGame, now = new Date()): Promise<Game> {
  const [row] = await db
    .insert(games)
    .values({ deckId, playedAt: input.playedAt, result: input.result, players: input.players, turns: input.turns ?? null, notes: input.notes, createdAt: now.toISOString() })
    .returning();
  return row;
}

/** Remove a game; returns it so it can be put back (Undo). */
export async function deleteGame(db: Db, gameId: number): Promise<Game | undefined> {
  const [row] = await db.delete(games).where(eq(games.id, gameId)).returning();
  return row;
}

export async function restoreGame(db: Db, row: Game) {
  await db.insert(games).values(row).onConflictDoNothing();
}

export type GameWithDeck = Game & { deckName: string };

/** Games newest first, for one deck or all of them. */
export async function listGames(db: Db, opts: { deckId?: number; limit?: number } = {}): Promise<GameWithDeck[]> {
  const rows = await db
    .select({ g: games, deckName: decks.name })
    .from(games)
    .leftJoin(decks, eq(decks.id, games.deckId))
    .where(opts.deckId ? eq(games.deckId, opts.deckId) : undefined)
    .orderBy(desc(games.playedAt), desc(games.id))
    .limit(opts.limit ?? 500);
  return rows.map((r) => ({ ...r.g, deckName: r.deckName ?? "Deleted deck" }));
}

export type GameRecord = {
  played: number;
  wins: number;
  losses: number;
  draws: number;
  /** Wins ÷ games, or null with no games. */
  winRate: number | null;
  /** The win rate you'd expect by chance: the average of 1 ÷ pod size. */
  fairShare: number | null;
  /** The last five results, newest first. */
  recent: GameResult[];
};

export function recordOf(list: readonly Pick<Game, "result" | "players">[]): GameRecord {
  const played = list.length;
  const wins = list.filter((g) => g.result === "win").length;
  const draws = list.filter((g) => g.result === "draw").length;
  return {
    played,
    wins,
    losses: played - wins - draws,
    draws,
    winRate: played ? wins / played : null,
    fairShare: played ? list.reduce((n, g) => n + 1 / Math.max(2, g.players), 0) / played : null,
    recent: list.slice(0, 5).map((g) => g.result),
  };
}

/** Each deck's record, most played first (decks with no games left out). */
export async function deckRecords(db: Db): Promise<{ deckId: number; name: string; record: GameRecord }[]> {
  const all = await listGames(db, { limit: 5000 });
  const byDeck = new Map<number, GameWithDeck[]>();
  for (const g of all) byDeck.set(g.deckId, [...(byDeck.get(g.deckId) ?? []), g]);
  const names = byDeck.size ? await db.select({ id: decks.id, name: decks.name }).from(decks).where(inArray(decks.id, [...byDeck.keys()])) : [];
  return [...byDeck.entries()]
    .map(([deckId, list]) => ({ deckId, name: names.find((n) => n.id === deckId)?.name ?? "Deleted deck", record: recordOf(list) }))
    .sort((a, b) => b.record.played - a.record.played || a.name.localeCompare(b.name));
}
