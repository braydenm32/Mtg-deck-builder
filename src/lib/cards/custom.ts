import { randomUUID } from "node:crypto";
import { and, asc, eq, or, sql } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db/client";
import { cards, deckCards, decks } from "@/db/schema";
import { clearCardNameRows } from "./name-cache";
import { colorString, normName } from "./normalize";

/**
 * Cards you make up: a playtest card, a card that's spoiled but not out yet, or a house card. They
 * live with the real cards (so a deck's search, stats, roles and proxy sheet treat them the same),
 * marked `custom`, with no printings and no price. Card syncs never touch them. A custom card added
 * to a deck is marked to proxy, so it never lands on the want list.
 */

export type CustomCardInput = { name: string; manaCost?: string; typeLine: string; oracleText?: string };

export const customCardSchema = z.object({
  name: z.string().trim().min(1).max(120),
  manaCost: z.string().trim().max(60).optional(),
  typeLine: z.string().trim().min(1).max(120),
  oracleText: z.string().max(1500).optional(),
});

/** The mana value of a cost such as "{2}{G}{G}" or "{X}{U/P}": numbers add, X counts 0, other symbols 1. */
export function manaValueOf(cost: string): number {
  let n = 0;
  for (const [, sym] of cost.matchAll(/\{([^}]+)\}/g)) {
    const s = sym.toUpperCase();
    if (/^\d+$/.test(s)) n += Number(s);
    else if (s === "X" || s === "Y" || s === "Z") continue;
    else if (/^2\/[WUBRG]$/.test(s)) n += 2;
    else n += 1;
  }
  return n;
}

const COLOUR_IN = (text: string) => ["W", "U", "B", "R", "G"].filter((c) => new RegExp(`\\{[^}]*${c}[^}]*\\}`, "i").test(text));

/** The card row a custom card is kept as. Its colour identity counts symbols in the cost and the rules text, as the rules say. */
export function customCardRow(input: CustomCardInput, oracleId: string, now = new Date()) {
  const name = input.name.trim().replace(/\s+/g, " ").slice(0, 120);
  const manaCost = (input.manaCost ?? "").trim().replace(/\s+/g, "") || null;
  const typeLine = input.typeLine.trim().slice(0, 120);
  const oracleText = (input.oracleText ?? "").trim().slice(0, 1500);
  const colors = colorString(COLOUR_IN(manaCost ?? ""));
  const identity = colorString([...COLOUR_IN(manaCost ?? ""), ...COLOUR_IN(oracleText)]);
  const legendary = /\bLegendary\b/i.test(typeLine);
  return {
    oracleId,
    name,
    normName: normName(name),
    normFrontName: normName(name.split(" // ")[0]),
    manaCost,
    cmc: manaValueOf(manaCost ?? ""),
    typeLine,
    oracleText,
    colors,
    colorIdentity: identity,
    keywords: [] as string[],
    layout: "normal",
    legalCommander: "legal",
    canBeCommander: (legendary && /\bCreature\b/i.test(typeLine)) || /can be your commander/i.test(oracleText),
    edhrecRank: null,
    gameChanger: false,
    paper: false,
    imageNormal: null,
    imageSmall: null,
    cardFaces: null,
    priceUsd: null,
    tokens: [] as { id: string; name: string }[],
    custom: true,
    updatedAt: now.toISOString(),
  };
}

export type CustomCard = { oracleId: string; name: string; manaCost: string | null; typeLine: string; oracleText: string; colorIdentity: string; decks: number };

export async function listCustomCards(db: Db): Promise<CustomCard[]> {
  const rows = await db
    .select({
      oracleId: cards.oracleId,
      name: cards.name,
      manaCost: cards.manaCost,
      typeLine: cards.typeLine,
      oracleText: cards.oracleText,
      colorIdentity: cards.colorIdentity,
      decks: sql<number>`(SELECT COUNT(*) FROM (
        SELECT dc.deck_id FROM deck_cards dc WHERE dc.oracle_id = "cards"."oracle_id"
        UNION SELECT d.id FROM decks d WHERE d.commander_oracle_id = "cards"."oracle_id" OR d.partner_oracle_id = "cards"."oracle_id"))`,
    })
    .from(cards)
    .where(eq(cards.custom, true))
    .orderBy(asc(cards.name));
  return rows.map((r) => ({ ...r, decks: Number(r.decks) }));
}

/** A name a real card (or another of yours) already has can't be reused: searches and decklists go by name. */
async function nameTaken(db: Db, name: string, except?: string) {
  const [hit] = await db.select({ oracleId: cards.oracleId }).from(cards).where(eq(cards.normName, normName(name)));
  return !!hit && hit.oracleId !== except;
}

export async function createCustomCard(db: Db, input: CustomCardInput): Promise<{ oracleId: string } | { error: string }> {
  if (!input.name.trim() || !input.typeLine.trim()) return { error: "A card needs a name and a type line." };
  if (await nameTaken(db, input.name)) return { error: "A card already has that name. Pick another." };
  const oracleId = randomUUID();
  await db.insert(cards).values(customCardRow(input, oracleId));
  clearCardNameRows();
  return { oracleId };
}

export async function updateCustomCard(db: Db, oracleId: string, input: CustomCardInput): Promise<{ ok: true } | { error: string }> {
  if (!input.name.trim() || !input.typeLine.trim()) return { error: "A card needs a name and a type line." };
  const [cur] = await db.select({ custom: cards.custom }).from(cards).where(eq(cards.oracleId, oracleId));
  if (!cur?.custom) return { error: "Not one of your cards." };
  if (await nameTaken(db, input.name, oracleId)) return { error: "A card already has that name. Pick another." };
  const row: Partial<ReturnType<typeof customCardRow>> = customCardRow(input, oracleId);
  delete row.oracleId;
  await db.update(cards).set(row).where(and(eq(cards.oracleId, oracleId), eq(cards.custom, true)));
  clearCardNameRows();
  return { ok: true };
}

/** Delete a custom card, and take it out of every deck it's in. Not while it leads a deck: change that deck's commander first. */
export async function deleteCustomCard(db: Db, oracleId: string): Promise<{ removedFromDecks: number } | { error: string } | undefined> {
  const [cur] = await db.select({ custom: cards.custom }).from(cards).where(eq(cards.oracleId, oracleId));
  if (!cur?.custom) return undefined;
  const [leads] = await db.select({ name: decks.name }).from(decks).where(or(eq(decks.commanderOracleId, oracleId), eq(decks.partnerOracleId, oracleId)));
  if (leads) return { error: `It's the commander of ${leads.name}. Give that deck another commander, or delete the deck, first.` };
  const removed = await db.delete(deckCards).where(eq(deckCards.oracleId, oracleId)).returning({ id: deckCards.id });
  await db.delete(cards).where(and(eq(cards.oracleId, oracleId), eq(cards.custom, true)));
  clearCardNameRows();
  return { removedFromDecks: removed.length };
}
