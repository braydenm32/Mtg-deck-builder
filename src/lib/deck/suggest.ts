import { and, eq, inArray, notInArray } from "drizzle-orm";
import type { Db } from "@/db/client";
import { cards, collectionItems } from "@/db/schema";
import { identityWithin, normName } from "@/lib/cards/normalize";
import { NON_DECK_LAYOUTS } from "@/lib/cards/rows";
import { edhrecEnabled, themeData } from "@/lib/edhrec/client";
import { isBasicLand } from "./build";
import { themeScore } from "./themes";

export type CommanderSuggestion = {
  oracleId: string;
  name: string;
  colorIdentity: string;
  imageSmall: string | null;
  imageNormal: string | null;
  owned: boolean;
  /** Your cards in this commander's colours that fit the theme. */
  fitting: number;
  /** Decks on EDHREC with this commander and theme. */
  edhrecDecks: number;
  /** How strongly the commander itself plays the theme (0..1). */
  selfFit: number;
  score: number;
  reason: string;
};

type CardRow = typeof cards.$inferSelect;

/**
 * Commanders for a theme. Commanders you own come first; then popular ones on EDHREC that you
 * don't own (to buy or proxy), each with how many of your cards would fit.
 */
export async function suggestCommanders(db: Db, theme: string, opts: { limit?: number } = {}) {
  const limit = opts.limit ?? 12;
  const ownedIds = (await db.selectDistinct({ id: collectionItems.oracleId }).from(collectionItems)).map((r) => r.id);
  const ownedCards = ownedIds.length
    ? await db
        .select()
        .from(cards)
        .where(and(inArray(cards.oracleId, ownedIds), eq(cards.legalCommander, "legal")))
    : [];
  const fittingCards = ownedCards
    .filter((c) => !isBasicLand(c.name))
    .map((c) => ({ c, fit: themeScore({ name: c.name, typeLine: c.typeLine, oracleText: c.oracleText, keywords: c.keywords }, theme) }))
    .filter((x) => x.fit >= 0.5);

  const tag = edhrecEnabled() ? await themeData(db, theme).catch(() => undefined) : undefined;
  const edhrecDecks = new Map<string, number>();
  for (const c of tag?.commanders ?? []) edhrecDecks.set(normName(c.name), c.numDecks);

  const describe = (c: CardRow, owned: boolean): CommanderSuggestion => {
    const fitting = fittingCards.filter((x) => x.c.oracleId !== c.oracleId && identityWithin(x.c.colorIdentity, c.colorIdentity)).length;
    const selfFit = themeScore({ name: c.name, typeLine: c.typeLine, oracleText: c.oracleText, keywords: c.keywords }, theme);
    const decks = edhrecDecks.get(c.normName) ?? edhrecDecks.get(c.normFrontName) ?? 0;
    const score = 3 * selfFit + Math.log2(fitting + 1) + (decks ? Math.log10(decks + 1) : 0);
    const parts: string[] = [];
    if (decks) parts.push(`${decks.toLocaleString("en-US")} EDHREC decks with this theme`);
    if (selfFit >= 0.8) parts.push("plays the theme itself");
    parts.push(`${fitting} of your cards fit`);
    return {
      oracleId: c.oracleId,
      name: c.name,
      colorIdentity: c.colorIdentity,
      imageSmall: c.imageSmall,
      imageNormal: c.imageNormal,
      owned,
      fitting,
      edhrecDecks: decks,
      selfFit,
      score: Math.round(score * 100) / 100,
      reason: parts.join(" · "),
    };
  };

  const owned = ownedCards
    .filter((c) => c.canBeCommander)
    .map((c) => describe(c, true))
    .filter((s) => s.selfFit > 0 || s.edhrecDecks > 0 || s.fitting >= 10)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  let popular: CommanderSuggestion[] = [];
  const names = (tag?.commanders ?? []).slice(0, 30).map((c) => c.name);
  if (names.length) {
    const rows = await db
      .select()
      .from(cards)
      .where(and(inArray(cards.name, names), notInArray(cards.layout, NON_DECK_LAYOUTS)));
    const ownedSet = new Set(ownedIds);
    popular = rows
      .filter((c) => !ownedSet.has(c.oracleId) && c.canBeCommander)
      .map((c) => describe(c, false))
      .sort((a, b) => b.edhrecDecks - a.edhrecDecks)
      .slice(0, limit);
  }
  return { owned, popular };
}
