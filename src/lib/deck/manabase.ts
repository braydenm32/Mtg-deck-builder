import { and, eq, inArray, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { cards, deckCards } from "@/db/schema";
import { cardAvailability } from "@/lib/collection/availability";
import { deckEntries } from "./entries";
import { deckStats, producedColors } from "./stats";
import { addDeckCard, getDeck, removeDeckCard, restoreDeckCard } from "./store";

/**
 * Mana base helper: how the basics should split for the colours the deck actually casts, and the
 * free lands you own that make two or more of its colours, each one tap from replacing a basic.
 */

const BASIC_OF: Record<string, string> = { W: "Plains", U: "Island", B: "Swamp", R: "Mountain", G: "Forest" };
const BASIC_NAME = /^(Snow-Covered )?(Plains|Island|Swamp|Mountain|Forest|Wastes)$/;

export type ManaColour = {
  color: string;
  basicName: string;
  /** Share of the deck's coloured pips. */
  pipShare: number;
  landSources: number;
  basics: number;
  /** Basics of this colour if the deck's basics split by pip share. */
  suggested: number;
};

export type LandOption = {
  oracleId: string;
  name: string;
  imageSmall: string | null;
  /** Deck colours it makes, WUBRG order. */
  makes: string;
  free: number;
  /** The basic row it would replace: one copy comes out. */
  cut?: { rowId: number; name: string };
};

export type ManaBase = {
  identity: string;
  lands: number;
  recommended: number;
  colours: ManaColour[];
  options: LandOption[];
};

/** Split `total` by `weights` with the largest remainder, giving any colour with weight at least one. */
export function splitBasics(total: number, weights: number[]): number[] {
  const sum = weights.reduce((n, w) => n + w, 0);
  if (!total || !weights.length) return weights.map(() => 0);
  const raw = weights.map((w) => (sum ? (w / sum) * total : total / weights.length));
  const out = raw.map((r, i) => (weights[i] > 0 || !sum ? Math.max(1, Math.floor(r)) : 0));
  let left = total - out.reduce((n, x) => n + x, 0);
  const order = raw.map((r, i) => ({ i, rem: r - Math.floor(r) })).sort((a, b) => b.rem - a.rem);
  for (let k = 0; left > 0 && order.length; k = (k + 1) % order.length, left--) out[order[k].i]++;
  while (left < 0) {
    const big = out.indexOf(Math.max(...out));
    out[big]--;
    left++;
  }
  return out;
}

export async function manaBase(db: Db, deckId: number): Promise<ManaBase | undefined> {
  const v = await getDeck(db, deckId);
  if (!v) return undefined;
  const stats = deckStats(deckEntries(v));
  const identity = stats.colorIdentity;
  const main = v.cards.filter((c) => c.board === "main");
  const colourStats = stats.colors.filter((c) => BASIC_OF[c.color]);
  const basicRows = new Map<string, { rowId: number; count: number }>();
  for (const c of main) {
    const m = BASIC_NAME.exec(c.name);
    const colour = m && Object.keys(BASIC_OF).find((k) => BASIC_OF[k] === m[2]);
    if (!colour) continue;
    const cur = basicRows.get(colour);
    basicRows.set(colour, { rowId: cur && cur.count >= c.quantity ? cur.rowId : c.id, count: (cur?.count ?? 0) + c.quantity });
  }
  const totalBasics = [...basicRows.values()].reduce((n, b) => n + b.count, 0);
  const split = splitBasics(
    totalBasics,
    colourStats.map((c) => c.pips),
  );
  const colours: ManaColour[] = colourStats.map((c, i) => ({
    color: c.color,
    basicName: BASIC_OF[c.color],
    pipShare: c.pipShare,
    landSources: c.landSources,
    basics: basicRows.get(c.color)?.count ?? 0,
    suggested: split[i],
  }));

  // Lands you own (not basics, not already in the deck) that make two or more of the deck's colours.
  const inDeck = new Set(v.cards.map((c) => c.oracleId));
  const ownedLandIds = (
    await db.all<{ id: string }>(sql`
      SELECT DISTINCT c.oracle_id AS id FROM collection_items ci CROSS JOIN cards c ON c.oracle_id = ci.oracle_id
      WHERE c.type_line LIKE '%Land%' AND NOT ci.proxy`)
  )
    .map((r) => r.id)
    .filter((id) => !inDeck.has(id));
  const options: LandOption[] = [];
  if (identity.length >= 2 && ownedLandIds.length) {
    const rows = [];
    for (let i = 0; i < ownedLandIds.length; i += 400) rows.push(...(await db.select().from(cards).where(inArray(cards.oracleId, ownedLandIds.slice(i, i + 400)))));
    const fits = rows.filter((c) => !BASIC_NAME.test(c.name) && [...c.colorIdentity].every((l) => identity.includes(l)));
    const avail = await cardAvailability(
      db,
      fits.map((c) => c.oracleId),
    );
    for (const c of fits) {
      const free = avail.get(c.oracleId)?.free ?? 0;
      if (free <= 0) continue;
      const makes = "WUBRG"
        .split("")
        .filter((l) => producedColors(c, identity).has(l as never))
        .join("");
      if (makes.length < 2) continue;
      options.push({ oracleId: c.oracleId, name: c.name, imageSmall: c.imageSmall, makes, free, cut: pickCut(colours, basicRows, makes) });
    }
    options.sort((a, b) => b.makes.length - a.makes.length || a.name.localeCompare(b.name));
  }

  return { identity, lands: stats.landAdvice.lands, recommended: stats.landAdvice.recommended, colours, options: options.slice(0, 10) };
}

/** The basic to take out for a land: the colour most over its share, preferring one the land also makes. */
function pickCut(colours: ManaColour[], rows: Map<string, { rowId: number; count: number }>, makes: string): LandOption["cut"] {
  let best: { c: ManaColour; score: number } | undefined;
  for (const c of colours) {
    if (!c.basics || !rows.get(c.color)) continue;
    const score = c.basics - c.suggested + (makes.includes(c.color) ? 1 : 0);
    if (!best || score > best.score || (score === best.score && c.basics > best.c.basics)) best = { c, score };
  }
  return best ? { rowId: rows.get(best.c.color)!.rowId, name: best.c.basicName } : undefined;
}

export type BasicSwap = { cutRowId: number; was: number; removed?: typeof deckCards.$inferSelect; inOracleId: string };

/** Take one copy of a basic out and put the land in. Undo with undoBasicSwap. */
export async function swapBasicFor(db: Db, deckId: number, cutRowId: number, inOracleId: string): Promise<BasicSwap | undefined> {
  const [row] = await db.select().from(deckCards).where(and(eq(deckCards.id, cutRowId), eq(deckCards.deckId, deckId), eq(deckCards.board, "main")));
  if (!row) return undefined;
  let removed: BasicSwap["removed"];
  if (row.quantity > 1) await db.update(deckCards).set({ quantity: row.quantity - 1 }).where(eq(deckCards.id, row.id));
  else removed = await removeDeckCard(db, deckId, row.id);
  try {
    await addDeckCard(db, deckId, inOracleId);
  } catch (e) {
    await undoBasic(db, deckId, { cutRowId, was: row.quantity, removed, inOracleId });
    throw e;
  }
  return { cutRowId, was: row.quantity, removed, inOracleId };
}

async function undoBasic(db: Db, deckId: number, s: BasicSwap) {
  if (s.removed) await restoreDeckCard(db, { ...s.removed, deckId });
  else await db.update(deckCards).set({ quantity: s.was }).where(and(eq(deckCards.id, s.cutRowId), eq(deckCards.deckId, deckId)));
}

export async function undoBasicSwap(db: Db, deckId: number, s: BasicSwap) {
  await db.delete(deckCards).where(and(eq(deckCards.deckId, deckId), eq(deckCards.oracleId, s.inOracleId), eq(deckCards.board, "main")));
  await undoBasic(db, deckId, s);
}
