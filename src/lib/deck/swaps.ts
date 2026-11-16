import { and, eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { deckCards, decks } from "@/db/schema";
import { GAME_CHANGER_LIMIT, isExtraTurn, isMassLandDenial } from "./bracket";
import { scoreCandidate, type Candidate } from "./build";
import { targetBracketOf, type BuildSettings } from "./status";
import { addDeckCard, candidatePool, commandersOf, deckEdhrec, removeDeckCard, restoreDeckCard } from "./store";

export type Swap = {
  /** The card from your collection to put in. */
  in: { oracleId: string; name: string; reason: string; imageSmall?: string | null };
  /** The deck card it would replace (its deck_cards row). */
  out: { id: number; oracleId: string; name: string };
  /** The job they share: "ramp", "draw", or "other" for a plain swap. */
  role: string;
  /** How much stronger the new card scored (EDHREC synergy, play rate, theme fit). */
  gain: number;
};

type DeckRow = { id: number; oracleId: string; name: string };

const primary = (c: Pick<Candidate, "roles">) => c.roles.find((r) => r !== "land") ?? "other";

/**
 * Pick swaps: free copies you own that score clearly higher than the deck's weakest cards, matched
 * job for job (ramp for ramp, removal for removal) where it can, so the deck's shape stays the same.
 * Lands are left alone (the mana base is its own question), and so is anything over the deck's
 * bracket: Game Changers past the limit, mass land denial and extra turns below Bracket 4.
 */
export function pickSwaps(rows: DeckRow[], pool: Candidate[], opts: { hasEdhrec: boolean; bracket: 1 | 2 | 3 | 4 | 5; gameChangers: number; limit?: number }): Swap[] {
  const byId = new Map(pool.map((c) => [c.oracleId, c]));
  const inDeck = new Set(rows.map((r) => r.oracleId));
  const isLand = (c: Candidate) => /\bLand\b/.test(c.typeLine.split(" // ")[0]);
  const score = (c: Candidate) => scoreCandidate(c, opts.hasEdhrec);
  // The deck's spells, weakest first.
  const outs = rows
    .map((r) => ({ r, c: byId.get(r.oracleId) }))
    .filter((x): x is { r: DeckRow; c: Candidate } => !!x.c && !isLand(x.c))
    .map((x) => ({ ...x, s: score(x.c), role: primary(x.c) }))
    .sort((a, b) => a.s - b.s);
  let gcRoom = Math.max(0, GAME_CHANGER_LIMIT[opts.bracket] - opts.gameChangers);
  const ins = pool
    .filter((c) => c.available > 0 && !inDeck.has(c.oracleId) && !isLand(c))
    .filter((c) => opts.bracket >= 4 || (!isMassLandDenial(c) && !isExtraTurn(c)))
    .map((c) => ({ c, s: score(c), role: primary(c) }))
    .sort((a, b) => b.s - a.s);
  const used = new Set<number>();
  const swaps: Swap[] = [];
  for (const x of ins) {
    if (swaps.length >= (opts.limit ?? 12)) break;
    if (x.c.gameChanger && gcRoom <= 0) continue;
    // Same job first; a card with no listed job can replace any other plain card.
    const out = outs.find((o) => !used.has(o.r.id) && o.role === x.role) ?? (x.role === "other" ? undefined : outs.find((o) => !used.has(o.r.id) && o.role === "other"));
    if (!out || x.s < out.s + 0.5) continue;
    used.add(out.r.id);
    if (x.c.gameChanger) gcRoom--;
    swaps.push({
      in: { oracleId: x.c.oracleId, name: x.c.name, reason: reasonOf(x.c) },
      out: { id: out.r.id, oracleId: out.r.oracleId, name: out.r.name },
      role: x.role,
      gain: Math.round((x.s - out.s) * 100) / 100,
    });
  }
  return swaps;
}

function reasonOf(c: Candidate): string {
  const parts: string[] = [];
  if (c.edhrec && c.edhrec.inclusion >= 0.01) parts.push(`In ${Math.round(c.edhrec.inclusion * 100)}% of decks for this commander`);
  if (c.edhrec && c.edhrec.synergy >= 0.1) parts.push(`synergy +${Math.round(c.edhrec.synergy * 100)}%`);
  if (!parts.length && c.theme >= 0.8) parts.push("Fits the theme");
  if (!parts.length && c.edhrecRank) parts.push(`Popular in Commander (EDHREC #${c.edhrecRank.toLocaleString("en-US")})`);
  return parts.join(" · ");
}

/**
 * Upgrade a deck (a precon, say) from your own collection: swaps of free copies you own for the
 * deck's weakest cards. Reads the whole card pool like a rebuild does, so it runs when asked.
 */
export async function collectionSwaps(db: Db, deckId: number): Promise<Swap[] | undefined> {
  const [deck] = await db.select().from(decks).where(eq(decks.id, deckId));
  if (!deck) return undefined;
  const cmdrs = await commandersOf(db, deck);
  if (!cmdrs.length) return [];
  const rows = await db
    .select({ id: deckCards.id, oracleId: deckCards.oracleId })
    .from(deckCards)
    .where(and(eq(deckCards.deckId, deckId), eq(deckCards.board, "main")));
  const edh = await deckEdhrec(db, cmdrs[0].name, cmdrs[1]?.name, deck.theme);
  const pool = await candidatePool(db, deck.colorIdentity, cmdrs.map((c) => c.oracleId), {
    excludeDeckId: deckId,
    theme: deck.theme,
    edhrec: edh?.cards,
    include: rows.map((r) => r.oracleId),
  });
  const names = new Map(pool.map((c) => [c.oracleId, c.name]));
  const gc = new Set(pool.filter((c) => c.gameChanger).map((c) => c.oracleId));
  const gameChangers = rows.filter((r) => gc.has(r.oracleId)).length + cmdrs.filter((c) => c.gameChanger).length;
  return pickSwaps(
    rows.map((r) => ({ ...r, name: names.get(r.oracleId) ?? "" })),
    pool,
    { hasEdhrec: !!edh?.cards.length, bracket: targetBracketOf(deck.settings as BuildSettings), gameChangers },
  );
}

/** Make a swap: the deck card out, your card in (locked, like any card you add). Returns the row taken out, for Undo. */
export async function applySwap(db: Db, deckId: number, outId: number, inOracleId: string) {
  const removed = await removeDeckCard(db, deckId, outId);
  if (!removed) return undefined;
  try {
    await addDeckCard(db, deckId, inOracleId);
  } catch (e) {
    await restoreDeckCard(db, removed);
    throw e;
  }
  return removed;
}

/** Undo a swap: take your card back out and put the old row back as it was. */
export async function undoSwap(db: Db, deckId: number, removed: typeof deckCards.$inferSelect, inOracleId: string) {
  await db.delete(deckCards).where(and(eq(deckCards.deckId, deckId), eq(deckCards.oracleId, inOracleId), eq(deckCards.board, "main")));
  await restoreDeckCard(db, { ...removed, deckId });
}
