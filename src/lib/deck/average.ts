import { inArray, or } from "drizzle-orm";
import type { Db } from "@/db/client";
import { cards } from "@/db/schema";
import { normName } from "@/lib/cards/normalize";
import { cardAvailability } from "@/lib/collection/availability";
import { commanderSlug, edhrecEnabled, edhrecPage } from "@/lib/edhrec/client";
import { getDeck } from "./store";

/**
 * Compare a deck with EDHREC's average deck for its commander (json.edhrec.com/pages/average-decks):
 * what the typical list plays that yours doesn't (and whether you own a free copy), what's yours
 * alone, and how the card types line up. Cached like every EDHREC page.
 */

export type AverageDeck = { cards: { name: string; quantity: number; type: string }[]; similar: string[] };

/** EDHREC's average deck: `deck.cards` is { Type: [[name, quantity], ...] }. */
export function parseAverageDeck(raw: unknown): AverageDeck | undefined {
  const page = raw as { deck?: { cards?: Record<string, [string, number][]> }; similar?: unknown } | undefined;
  const lists = page?.deck?.cards;
  if (!lists || typeof lists !== "object") return undefined;
  const out: AverageDeck["cards"] = [];
  for (const [type, entries] of Object.entries(lists)) {
    if (!Array.isArray(entries)) continue;
    for (const e of entries) if (Array.isArray(e) && typeof e[0] === "string") out.push({ name: e[0], quantity: Number(e[1]) || 1, type });
  }
  const similar = Array.isArray(page?.similar) ? page.similar.filter((s): s is string => typeof s === "string") : [];
  return out.length ? { cards: out, similar } : undefined;
}

/** EDHREC's type groups, in the order it lists them. */
export const TYPE_ORDER = ["Creature", "Instant", "Sorcery", "Artifact", "Enchantment", "Planeswalker", "Battle", "Land"] as const;

/** The type EDHREC files a card under: lands first, then creatures, then the rest. */
export function typeGroup(typeLine: string): string {
  const front = typeLine.split(" // ")[0];
  if (/\bLand\b/.test(front)) return "Land";
  for (const t of ["Creature", "Planeswalker", "Battle", "Instant", "Sorcery", "Artifact", "Enchantment"]) if (new RegExp(`\\b${t}\\b`).test(front)) return t;
  return "Other";
}

const BASIC = /^(Plains|Island|Swamp|Mountain|Forest|Wastes|Snow-Covered (Plains|Island|Swamp|Mountain|Forest))$/;

export type AverageCard = {
  name: string;
  oracleId: string | null;
  type: string;
  /** Your copies, and how many no deck holds. */
  owned: number;
  free: number;
  imageSmall: string | null;
};

export type AverageCompare =
  | { ok: false; reason: "edhrec-off" | "not-found" }
  | {
      ok: true;
      commander: string;
      /** Cards (not basics) the average deck and yours share, out of the average deck's. */
      shared: number;
      averageCards: number;
      missing: AverageCard[];
      extra: string[];
      types: { type: string; yours: number; average: number }[];
      basics: { yours: number; average: number };
    };

export async function compareWithAverage(db: Db, deckId: number, fetchPage = edhrecPage): Promise<AverageCompare | undefined> {
  const v = await getDeck(db, deckId);
  if (!v) return undefined;
  if (!edhrecEnabled()) return { ok: false, reason: "edhrec-off" };
  const [cmd, partner] = v.commanders;
  if (!cmd) return { ok: false, reason: "not-found" };
  const avg = parseAverageDeck(await fetchPage(db, `average-decks/${commanderSlug(cmd.name, partner?.name)}`));
  if (!avg) return { ok: false, reason: "not-found" };

  const main = v.cards.filter((c) => c.board === "main");
  const commanderNames = new Set(v.commanders.map((c) => normName(c.name)));
  const avgCards = avg.cards.filter((c) => c.type !== "Commander" && !commanderNames.has(normName(c.name)));
  // A card counts as yours by full name or front face ("Fable of the Mirror-Breaker").
  const mine = new Set(main.flatMap((c) => [normName(c.name), normName(c.name.split(" // ")[0])]));
  const isMine = (name: string) => mine.has(normName(name));

  const avgSpells = avgCards.filter((c) => !BASIC.test(c.name));
  const missingNames = avgSpells.filter((c) => !isMine(c.name));
  const avgSet = new Set(avgSpells.flatMap((c) => [normName(c.name), normName(c.name.split(" // ")[0])]));
  const extra = main.filter((c) => !BASIC.test(c.name) && !avgSet.has(normName(c.name)) && !avgSet.has(normName(c.name.split(" // ")[0]))).map((c) => c.name);

  // The missing cards' oracle IDs, by normalised name (indexed), for ownership and adding.
  const norms = [...new Set(missingNames.map((c) => normName(c.name)))];
  const rows = norms.length
    ? await db
        .select({ oracleId: cards.oracleId, normName: cards.normName, normFront: cards.normFrontName, imageSmall: cards.imageSmall })
        .from(cards)
        .where(or(inArray(cards.normName, norms), inArray(cards.normFrontName, norms)))
    : [];
  const byNorm = new Map<string, (typeof rows)[number]>();
  for (const r of rows) {
    byNorm.set(r.normName, r);
    if (!byNorm.has(r.normFront)) byNorm.set(r.normFront, r);
  }
  const avail = await cardAvailability(db, rows.map((r) => r.oracleId));
  const missing: AverageCard[] = missingNames.map((c) => {
    const r = byNorm.get(normName(c.name));
    const a = r ? avail.get(r.oracleId) : undefined;
    return { name: c.name, oracleId: r?.oracleId ?? null, type: c.type, owned: a?.owned ?? 0, free: a?.free ?? 0, imageSmall: r?.imageSmall ?? null };
  });
  // Free copies first (they cost nothing), then ones you own elsewhere, then the rest in EDHREC's order.
  missing.sort((a, b) => Number(b.free > 0) - Number(a.free > 0) || Number(b.owned > 0) - Number(a.owned > 0));

  const count = (list: { type: string; quantity: number }[], t: string) => list.filter((c) => c.type === t).reduce((n, c) => n + c.quantity, 0);
  const yoursTyped = main.map((c) => ({ type: typeGroup(c.typeLine), quantity: c.quantity }));
  const types = TYPE_ORDER.map((t) => ({ type: t, yours: count(yoursTyped, t), average: count(avgCards, t) })).filter((t) => t.yours || t.average);
  const basicsOf = (list: { name: string; quantity: number }[]) => list.filter((c) => BASIC.test(c.name)).reduce((n, c) => n + c.quantity, 0);

  return {
    ok: true,
    commander: v.commanders.map((c) => c.name).join(" + "),
    shared: avgSpells.length - missingNames.length,
    averageCards: avgSpells.length,
    missing,
    extra,
    types,
    basics: { yours: basicsOf(main), average: basicsOf(avgCards) },
  };
}
