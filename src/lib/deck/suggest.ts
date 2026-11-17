import { and, asc, eq, inArray, isNotNull, notInArray } from "drizzle-orm";
import type { Db } from "@/db/client";
import { cards, collectionItems } from "@/db/schema";
import { identityWithin, normName } from "@/lib/cards/normalize";
import { NON_DECK_LAYOUTS } from "@/lib/cards/rows";
import { edhrecEnabled, themeData } from "@/lib/edhrec/client";
import { isBasicLand } from "./build";
import { themeLabel, themeParts, themeScore } from "./themes";

export type CommanderSuggestion = {
  oracleId: string;
  name: string;
  colorIdentity: string;
  imageSmall: string | null;
  imageNormal: string | null;
  /** For the card preview: its cost, type and rules text (each face's, for a two-faced card). */
  manaCost: string | null;
  typeLine: string;
  oracleText: string;
  faces: { name: string; manaCost?: string; typeLine?: string; oracleText?: string; imageNormal?: string }[] | null;
  owned: boolean;
  /** Your cards in this commander's colours that fit the theme (any of them, for a mix). */
  fitting: number;
  /** Decks on EDHREC with this commander and theme (summed over a mix's themes). */
  edhrecDecks: number;
  /** How strongly the commander itself plays the theme (0..1; its best theme, for a mix). */
  selfFit: number;
  /** For a mix of themes: how many of them this commander suits (plays it, EDHREC lists it, or 5+ of your cards fit). */
  covers?: number;
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
  manaCost: cards.manaCost,
  cardFaces: cards.cardFaces,
};
type CardRow = Pick<typeof cards.$inferSelect, keyof typeof COLUMNS>;

/**
 * Commanders for a theme, colours, or both. Commanders you own come first; then popular ones you
 * don't own (to buy or proxy), each with how many of your cards would fit.
 *
 * `theme` can mix up to three themes ("tokens+angels"): a card fits if it fits any of them, and
 * commanders that suit every theme rank first. `colors` (a WUBRG string, "" for colourless) keeps
 * only commanders with exactly that colour identity. Without a theme, owned commanders rank by how
 * many of your cards they can use, and popular ones by EDHREC rank.
 */
export async function suggestCommanders(db: Db, theme: string | undefined, opts: { limit?: number; colors?: string } = {}) {
  const limit = opts.limit ?? 12;
  const colors = opts.colors;
  const themes = themeParts(theme);
  const mix = themes.length > 1;
  const inColors = (c: Pick<CardRow, "colorIdentity">) => colors === undefined || c.colorIdentity === colors;
  // EDHREC (cached a week) is asked at the same time as the database, not after it.
  const tagsPromise = Promise.all(themes.map((t) => (edhrecEnabled() && /^[a-z0-9-]+$/.test(t) ? themeData(db, t).catch(() => undefined) : Promise.resolve(undefined))));
  // Your cards in one query: a subquery rather than every owned id sent as a parameter.
  const owns = await db
    .select({ ...COLUMNS, legalCommander: cards.legalCommander })
    .from(cards)
    .where(inArray(cards.oracleId, db.selectDistinct({ id: collectionItems.oracleId }).from(collectionItems)));
  const ownedIds = owns.map((c) => c.oracleId);
  const ownedCards: CardRow[] = owns.filter((c) => c.legalCommander === "legal");
  const tags = await tagsPromise;
  // Cards EDHREC plays far more in the theme than elsewhere fit it too, for themes the rules text
  // can't spot (Combo, Politics). Staples every deck plays (Sol Ring, Command Tower) have low synergy.
  const edhrecCards = tags.map((tag) => new Set((tag?.cards ?? []).filter((c) => c.synergy >= 0.25).map((c) => normName(c.name))));
  const cardOf = (c: CardRow) => ({ name: c.name, typeLine: c.typeLine, oracleText: c.oracleText, keywords: c.keywords });
  /** How well a card fits each theme. */
  const fitsOf = (c: CardRow) => themes.map((t, i) => Math.max(themeScore(cardOf(c), t), edhrecCards[i].has(c.normName) ? 0.6 : 0));
  const fittingCards = ownedCards
    .filter((c) => !isBasicLand(c.name))
    .map((c) => ({ c, fits: themes.length ? fitsOf(c).map((f) => f >= 0.5) : [] }))
    .filter((x) => !themes.length || x.fits.some(Boolean));

  const edhrecDecks = tags.map((tag) => new Map((tag?.commanders ?? []).map((c) => [normName(c.name), c.numDecks])));

  const describe = (c: CardRow, owned: boolean): CommanderSuggestion => {
    const usable = fittingCards.filter((x) => x.c.oracleId !== c.oracleId && identityWithin(x.c.colorIdentity, c.colorIdentity));
    const fitting = usable.length;
    const fitBy = themes.map((_, i) => usable.filter((x) => x.fits[i]).length);
    const selfBy = themes.map((t) => themeScore(cardOf(c), t));
    const decksBy = edhrecDecks.map((m) => m.get(c.normName) ?? m.get(c.normFrontName) ?? 0);
    const selfFit = Math.max(0, ...selfBy);
    const decks = decksBy.reduce((a, b) => a + b, 0);
    const covers = themes.filter((_, i) => selfBy[i] >= 0.5 || decksBy[i] > 0 || fitBy[i] >= 5).length;
    // Without a theme, popularity comes from EDHREC rank (lower is more played).
    const rankBoost = !themes.length && c.edhrecRank ? Math.max(0, 3 - Math.log10(c.edhrecRank)) : 0;
    // One theme: as it always was. A mix: each theme's part averaged, plus a bonus for suiting all of them.
    const score = mix
      ? themes.reduce((sum, _, i) => sum + 3 * selfBy[i] + Math.log2(fitBy[i] + 1) + Math.log10(decksBy[i] + 1), 0) / themes.length + 2 * (covers / themes.length) + 0.5 * Math.log2(fitting + 1)
      : 3 * selfFit + Math.log2(fitting + 1) + (decks ? Math.log10(decks + 1) : 0) + rankBoost;
    const parts: string[] = [];
    if (mix) {
      const listed = themes.filter((_, i) => decksBy[i] > 0);
      if (listed.length) parts.push(`EDHREC decks for ${listed.map(themeLabel).join(" and ")}`);
      const plays = themes.filter((_, i) => selfBy[i] >= 0.8);
      if (plays.length) parts.push(`plays ${plays.map(themeLabel).join(" and ")} itself`);
      parts.push(`${fitting} of your cards fit (${themes.map((t, i) => `${fitBy[i]} ${themeLabel(t)}`).join(", ")})`);
    } else {
      if (decks) parts.push(`${decks.toLocaleString("en-US")} EDHREC decks with this theme`);
      if (selfFit >= 0.8) parts.push("plays the theme itself");
      parts.push(themes.length ? `${fitting} of your cards fit` : `${fitting} of your cards can go in`);
    }
    return {
      oracleId: c.oracleId,
      name: c.name,
      colorIdentity: c.colorIdentity,
      imageSmall: c.imageSmall,
      imageNormal: c.imageNormal,
      manaCost: c.manaCost,
      typeLine: c.typeLine,
      oracleText: c.oracleText,
      faces: c.cardFaces?.length ? c.cardFaces.map((f) => ({ name: f.name, manaCost: f.manaCost, typeLine: f.typeLine, oracleText: f.oracleText, imageNormal: f.imageNormal })) : null,
      owned,
      fitting,
      edhrecDecks: decks,
      selfFit,
      ...(mix ? { covers } : {}),
      score: Math.round(score * 100) / 100,
      reason: parts.join(" · "),
    };
  };

  const owned = ownedCards
    .filter((c) => c.canBeCommander && inColors(c))
    .map((c) => describe(c, true))
    .filter((s) => !themes.length || s.selfFit > 0 || s.edhrecDecks > 0 || s.fitting >= 10)
    .sort((a, b) => (b.covers ?? 0) - (a.covers ?? 0) || b.score - a.score || a.name.localeCompare(b.name))
    .slice(0, limit);

  // Popular: EDHREC's commanders for the theme; with colours chosen, topped up from the card data
  // (most played commanders in exactly those colours), since EDHREC's list may have few or none.
  const ownedSet = new Set(ownedIds);
  // For a mix, each theme's top commanders (EDHREC has no page for a mix).
  const names = [...new Set(tags.flatMap((tag) => (tag?.commanders ?? []).slice(0, mix ? 40 : 30).map((c) => c.name)))];
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
        .limit(themes.length ? 300 : limit * 3)),
    );
  }
  const seen = new Set<string>();
  const popular = rows
    .filter((c) => !seen.has(c.oracleId) && (seen.add(c.oracleId), true))
    .filter((c) => !ownedSet.has(c.oracleId) && c.canBeCommander && inColors(c))
    .map((c) => describe(c, false))
    // With a theme, only commanders that play it (or EDHREC lists for it) are suggested.
    .filter((s) => !themes.length || s.edhrecDecks > 0 || s.selfFit >= 0.5)
    // A mix ranks by how many of its themes a commander suits, then score: deck counts aren't comparable across themes.
    .sort((a, b) => (mix ? (b.covers ?? 0) - (a.covers ?? 0) || b.score - a.score : b.edhrecDecks - a.edhrecDecks || b.score - a.score) || a.name.localeCompare(b.name))
    .slice(0, limit);
  return { owned, popular };
}
