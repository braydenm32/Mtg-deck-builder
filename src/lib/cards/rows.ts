import type { ScryfallCard } from "@/lib/scryfall/client";
import { colorString, frontFace, normName } from "./normalize";
import type { CardFace } from "@/db/schema";

export type CardRow = typeof import("@/db/schema").cards.$inferInsert;
export type PrintingRow = typeof import("@/db/schema").printings.$inferInsert;

const price = (p: string | null | undefined) => (p ? Number.parseFloat(p) : null);

export function oracleIdOf(c: ScryfallCard): string | undefined {
  return c.oracle_id ?? c.card_faces?.find((f) => f.oracle_id)?.oracle_id;
}

function images(c: ScryfallCard) {
  const uris = c.image_uris ?? c.card_faces?.[0]?.image_uris;
  return { imageNormal: uris?.normal ?? null, imageSmall: uris?.small ?? null };
}

/**
 * Scryfall layouts that aren't cards you put in a deck: tokens, art cards, Theme cards, planes,
 * schemes, Vanguard, emblems. They share names with real cards ("Mutavault" the token), so name
 * lookups and commander checks skip them.
 */
export const NON_DECK_LAYOUTS = ["token", "double_faced_token", "art_series", "front_card", "planar", "scheme", "vanguard", "emblem"];

/**
 * Can this card be a commander? A legendary creature on the front face; a legendary Vehicle or
 * Spacecraft with power and toughness (Edge of Eternities rule); or the rules text says so.
 */
export function canBeCommander(c: Pick<ScryfallCard, "type_line" | "oracle_text" | "card_faces"> & Partial<Pick<ScryfallCard, "layout" | "power" | "toughness">>): boolean {
  if (c.layout && NON_DECK_LAYOUTS.includes(c.layout)) return false;
  const frontType = c.card_faces?.[0]?.type_line ?? c.type_line ?? "";
  const front = frontType.split(" // ")[0];
  if (/\bLegendary\b/.test(front) && /\bCreature\b/.test(front)) return true;
  const power = c.card_faces?.[0]?.power ?? c.power;
  const toughness = c.card_faces?.[0]?.toughness ?? c.toughness;
  if (/\bLegendary\b/.test(front) && /\b(?:Vehicle|Spacecraft)\b/.test(front) && power !== undefined && toughness !== undefined) return true;
  const text = [c.oracle_text, ...(c.card_faces?.map((f) => f.oracle_text) ?? [])].join("\n");
  if (/can be your commander/i.test(text)) return true;
  // Grist, the Hunger Tide: a legendary non-creature that is a creature everywhere but the battlefield.
  return /\bLegendary\b/.test(front) && /isn't on the battlefield, it's an? [^.]*\bcreature\b/i.test(text);
}

export function toCardRow(c: ScryfallCard, now: string): CardRow | undefined {
  const oracleId = oracleIdOf(c);
  if (!oracleId) return undefined;
  const faces: CardFace[] | null = c.card_faces
    ? c.card_faces.map((f) => ({
        name: f.name,
        manaCost: f.mana_cost,
        typeLine: f.type_line,
        oracleText: f.oracle_text,
        imageNormal: f.image_uris?.normal,
        imageSmall: f.image_uris?.small,
      }))
    : null;
  const oracleText = c.oracle_text ?? c.card_faces?.map((f) => f.oracle_text ?? "").join("\n//\n") ?? "";
  const manaCost = c.mana_cost ?? c.card_faces?.map((f) => f.mana_cost ?? "").join(" // ") ?? null;
  const colors = c.colors ?? c.card_faces?.flatMap((f) => (f as { colors?: string[] }).colors ?? []) ?? [];
  return {
    oracleId,
    name: c.name,
    normName: normName(c.name),
    normFrontName: normName(frontFace(c.name)),
    manaCost,
    cmc: c.cmc ?? 0,
    typeLine: c.type_line ?? c.card_faces?.map((f) => f.type_line ?? "").join(" // ") ?? "",
    oracleText,
    colors: colorString(colors),
    colorIdentity: colorString(c.color_identity),
    keywords: c.keywords ?? [],
    layout: c.layout,
    legalCommander: c.legalities?.commander ?? "not_legal",
    canBeCommander: canBeCommander(c),
    edhrecRank: c.edhrec_rank ?? null,
    gameChanger: c.game_changer ?? false,
    ...images(c),
    cardFaces: faces,
    priceUsd: price(c.prices?.usd) ?? price(c.prices?.usd_foil),
    tokens: tokensOf(c),
    updatedAt: now,
  };
}

/** The tokens and emblems a card makes, once each (a token card lists itself too; that's left out). */
export function tokensOf(c: Pick<ScryfallCard, "all_parts" | "id" | "name">): { id: string; name: string }[] {
  const seen = new Set<string>();
  const out: { id: string; name: string }[] = [];
  for (const p of c.all_parts ?? []) {
    if (p.component !== "token" || p.id === c.id || p.name === c.name || seen.has(p.name)) continue;
    seen.add(p.name);
    out.push({ id: p.id, name: p.name });
  }
  return out;
}

const SPECIAL_SET_TYPES = new Set(["box", "promo", "memorabilia", "funny", "token", "minigame", "alchemy", "treasure_chest", "vanguard", "arsenal", "spellbook", "from_the_vault", "premium_deck"]);
const SPECIAL_PROMO_TYPES = new Set(["serialized", "doublerainbow", "textured", "galaxyfoil", "surgefoil", "halofoil", "confettifoil", "stepandcompleat", "oilslick", "gilded", "raisedfoil", "rainbowfoil", "neonink", "boosterfun", "prerelease", "stamped", "datestamped", "playtest", "thick", "jpwalker", "invisibleink", "fracturefoil", "manafoil", "firstplacefoil", "rippleFoil"]);
const SPECIAL_FRAMES = new Set(["showcase", "extendedart", "etched", "inverted", "fullart", "borderless", "shatteredglass"]);

/**
 * How unusual a printing is. 0 = a regular printing from a normal set. When we only know a
 * card's name we pick the lowest rank, so "Mana Vault" lands on a regular printing rather than a
 * serialized Secret Lair one.
 */
export function variantRank(c: ScryfallCard): number {
  let r = 0;
  if (c.oversized) r += 8;
  if (c.set_type && SPECIAL_SET_TYPES.has(c.set_type)) r += 5;
  if (c.set === "plst" || c.set === "plist") r += 4; // The List
  if (c.promo) r += 4;
  if (c.promo_types?.some((p) => SPECIAL_PROMO_TYPES.has(p))) r += 3;
  if (c.promo_types?.includes("universesbeyond")) r += 1;
  if (c.border_color === "borderless" || c.full_art || c.textless) r += 2;
  if (c.frame_effects?.some((f) => SPECIAL_FRAMES.has(f))) r += 2;
  if (!/^\d+$/.test(c.collector_number)) r += 1; // "796★", "12p", "123s"
  if (c.finishes && !c.finishes.includes("nonfoil")) r += 1;
  return r;
}

export function toPrintingRow(c: ScryfallCard, now: string): PrintingRow | undefined {
  const oracleId = oracleIdOf(c);
  if (!oracleId) return undefined;
  return {
    id: c.id,
    oracleId,
    name: c.name,
    setCode: c.set.toLowerCase(),
    setName: c.set_name,
    collectorNumber: c.collector_number.toLowerCase(),
    lang: c.lang,
    rarity: c.rarity,
    setType: c.set_type ?? "expansion",
    variantRank: variantRank(c),
    finishes: c.finishes ?? ["nonfoil"],
    tcgplayerId: c.tcgplayer_id ?? null,
    releasedAt: c.released_at ?? null,
    ...images(c),
    priceUsd: price(c.prices?.usd),
    priceUsdFoil: price(c.prices?.usd_foil),
    priceUsdEtched: price(c.prices?.usd_etched),
    priceEur: price(c.prices?.eur),
    priceEurFoil: price(c.prices?.eur_foil),
    updatedAt: now,
  };
}
