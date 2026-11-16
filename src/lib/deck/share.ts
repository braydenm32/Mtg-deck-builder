import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { decks } from "@/db/schema";
import { getDeck, targetBracketOf } from "./store";
import { frontType } from "./text";

/**
 * A deck's read-only link (/s/<token>): anyone with the link sees the commander and the list, and
 * nothing else of yours (no notes, prices, locations, buy or proxy marks, or other decks). Turning
 * it off forgets the token, so the old link stops working; turning it on again makes a new one.
 */

const TYPE_ORDER = ["Creature", "Planeswalker", "Battle", "Instant", "Sorcery", "Artifact", "Enchantment", "Land"];

/** 22 characters of randomness: unguessable, and short enough to paste in a group chat. */
export const newShareToken = () => randomBytes(16).toString("base64url");

const TOKEN = /^[A-Za-z0-9_-]{16,64}$/;

/** Share the deck (keeping its link if it has one) or stop sharing it. Returns the token, or null. */
export async function setDeckShared(db: Db, deckId: number, on: boolean): Promise<string | null | undefined> {
  const [deck] = await db.select({ token: decks.shareToken }).from(decks).where(eq(decks.id, deckId));
  if (!deck) return undefined;
  if (!on) {
    await db.update(decks).set({ shareToken: null }).where(eq(decks.id, deckId));
    return null;
  }
  if (deck.token) return deck.token;
  const token = newShareToken();
  await db.update(decks).set({ shareToken: token }).where(eq(decks.id, deckId));
  return token;
}

export type SharedCard = { name: string; quantity: number; manaCost: string | null; imageNormal: string | null };
export type SharedDeck = {
  name: string;
  colorIdentity: string;
  bracket: number;
  commanders: { name: string; typeLine: string; imageNormal: string | null }[];
  /** The 99 by card type, each sorted by mana value then name. */
  groups: { type: string; count: number; cards: SharedCard[] }[];
  count: number;
};

/** The shared deck for a link, or undefined when the link is wrong or was turned off. */
export async function sharedDeck(db: Db, token: string): Promise<SharedDeck | undefined> {
  if (!TOKEN.test(token)) return undefined;
  const [row] = await db.select({ id: decks.id }).from(decks).where(eq(decks.shareToken, token));
  if (!row) return undefined;
  const v = await getDeck(db, row.id);
  if (!v) return undefined;
  const main = v.cards.filter((c) => c.board === "main");
  const byType = new Map<string, typeof main>();
  for (const c of main) {
    const t = frontType(c);
    const type = TYPE_ORDER.find((x) => t.includes(x)) ?? "Other";
    byType.set(type, [...(byType.get(type) ?? []), c]);
  }
  const groups = [...byType.entries()]
    .sort(([a], [b]) => (TYPE_ORDER.indexOf(a) + 1 || 99) - (TYPE_ORDER.indexOf(b) + 1 || 99))
    .map(([type, list]) => ({
      type,
      count: list.reduce((n, c) => n + c.quantity, 0),
      cards: list
        .sort((a, b) => a.cmc - b.cmc || a.name.localeCompare(b.name))
        .map((c) => ({ name: c.name, quantity: c.quantity, manaCost: c.manaCost, imageNormal: c.imageNormal })),
    }));
  return {
    name: v.deck.name,
    colorIdentity: v.deck.colorIdentity,
    bracket: targetBracketOf(v.deck.settings),
    commanders: v.commanders.map((c) => ({ name: c.name, typeLine: c.typeLine, imageNormal: c.imageNormal })),
    groups,
    count: v.commanders.length + main.reduce((n, c) => n + c.quantity, 0),
  };
}

/** The list as plain text ("1 Sol Ring"), commander first, for pasting into another app. */
export function sharedDecklist(d: SharedDeck): string {
  return [...d.commanders.map((c) => `1 ${c.name}`), "", ...d.groups.flatMap((g) => g.cards.map((c) => `${c.quantity} ${c.name}`))].join("\n");
}
