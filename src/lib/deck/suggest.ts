import { and, asc, eq, inArray, isNotNull, notInArray } from "drizzle-orm";
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

/** Only what suggestions read (whole rows with art, faces and prices were megabytes for a big collection). */
const COLUMNS = {
  oracleId: cards.oracleId,
  name: cards.name,
  normName: cards.normName,
  normFrontName: cards.normFrontName,
  typeLine: cards.typeLine,
  oracleText: cards.oracleText,
  keywords: cards.keywords,
  colorIdentity: cards.colorIdentity,
  canBeCommander: cards.canBeCommander,
  edhrecRank: cards.edhrecRank,
  imageSmall: cards.imageSmall,
  imageNormal: cards.imageNormal,
};
type CardRow = Pick<typeof cards.$inferSelect, keyof typeof COLUMNS>;

/**
 * Commanders for a theme, colours, or both. Commanders you own come first; then popular ones you
 * don't own (to buy or proxy), each with how many of your cards would fit.
 *
 * `colors` (a WUBRG string, "" for colourless) keeps only commanders with exactly that colour
 * identity. Without a theme, owned commanders rank by how many of your cards they can use, and
 * popular ones by EDHREC rank.
 */
export async function suggestCommanders(db: Db, theme: string | undefined, opts: { limit?: number; colors?: string } = {}) {
  const limit = opts.limit ?? 12;
  const colors = opts.colors;
  const inColors = (c: Pick<CardRow, "colorIdentity">) => colors === undefined || c.colorIdentity === colors;
  // EDHREC (cached a week) is asked at the same time as the database, not after it.
  const tagPromise = theme && edhrecEnabled() ? themeData(db, theme).catch(() => undefined) : Promise.resolve(undefined);
  // Your cards in one query: a subquery rather than every owned id sent as a parameter.
  const owns = await db
    .select({ ...COLUMNS, legalCommander: cards.legalCommander })
    .from(cards)
    .where(inArray(cards.oracleId, db.selectDistinct({ id: collectionItems.oracleId }).from(collectionItems)));
  const ownedIds = owns.map((c) => c.oracleId);
  const ownedCards: CardRow[] = owns.filter((c) => c.legalCommander === "legal");
  const fittingCards = ownedCards
    .filter((c) => !isBasicLand(c.name))
    .map((c) => ({ c, fit: theme ? themeScore({ name: c.name, typeLine: c.typeLine, oracleText: c.oracleText, keywords: c.keywords }, theme) : 1 }))
    .filter((x) => x.fit >= 0.5);

  const tag = await tagPromise;
  const edhrecDecks = new Map<string, number>();
  for (const c of tag?.commanders ?? []) edhrecDecks.set(normName(c.name), c.numDecks);

  const describe = (c: CardRow, owned: boolean): CommanderSuggestion => {
    const fitting = fittingCards.filter((x) => x.c.oracleId !== c.oracleId && identityWithin(x.c.colorIdentity, c.colorIdentity)).length;
    const selfFit = theme ? themeScore({ name: c.name, typeLine: c.typeLine, oracleText: c.oracleText, keywords: c.keywords }, theme) : 0;
    const decks = edhrecDecks.get(c.normName) ?? edhrecDecks.get(c.normFrontName) ?? 0;
    // Without a theme, popularity comes from EDHREC rank (lower is more played).
    const rankBoost = !theme && c.edhrecRank ? Math.max(0, 3 - Math.log10(c.edhrecRank)) : 0;
    const score = 3 * selfFit + Math.log2(fitting + 1) + (decks ? Math.log10(decks + 1) : 0) + rankBoost;
    const parts: string[] = [];
    if (decks) parts.push(`${decks.toLocaleString("en-US")} EDHREC decks with this theme`);
    if (selfFit >= 0.8) parts.push("plays the theme itself");
    parts.push(theme ? `${fitting} of your cards fit` : `${fitting} of your cards can go in`);
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
    .filter((c) => c.canBeCommander && inColors(c))
    .map((c) => describe(c, true))
    .filter((s) => !theme || s.selfFit > 0 || s.edhrecDecks > 0 || s.fitting >= 10)
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    .slice(0, limit);

  // Popular: EDHREC's commanders for the theme; with colours chosen, topped up from the card data
  // (most played commanders in exactly those colours), since EDHREC's list may have few or none.
  const ownedSet = new Set(ownedIds);
  const names = (tag?.commanders ?? []).slice(0, 30).map((c) => c.name);
  const rows: CardRow[] = names.length
    ? await db
        .select(COLUMNS)
        .from(cards)
        // normName is indexed; cards.name alone made this read every card.
        .where(and(inArray(cards.normName, names.map(normName)), inArray(cards.name, names), notInArray(cards.layout, NON_DECK_LAYOUTS)))
    : [];
  if (colors !== undefined) {
    rows.push(
      ...(await db
        .select(COLUMNS)
        .from(cards)
        .where(
          and(
            eq(cards.canBeCommander, true),
            eq(cards.legalCommander, "legal"),
            eq(cards.colorIdentity, colors),
            isNotNull(cards.edhrecRank),
            notInArray(cards.layout, NON_DECK_LAYOUTS),
          ),
        )
        .orderBy(asc(cards.edhrecRank))
        .limit(theme ? 300 : limit * 3)),
    );
  }
  const seen = new Set<string>();
  const popular = rows
    .filter((c) => !seen.has(c.oracleId) && (seen.add(c.oracleId), true))
    .filter((c) => !ownedSet.has(c.oracleId) && c.canBeCommander && inColors(c))
    .map((c) => describe(c, false))
    // With a theme, only commanders that play it (or EDHREC lists for it) are suggested.
    .filter((s) => !theme || s.edhrecDecks > 0 || s.selfFit >= 0.5)
    .sort((a, b) => b.edhrecDecks - a.edhrecDecks || b.score - a.score || a.name.localeCompare(b.name))
    .slice(0, limit);
  return { owned, popular };
}
