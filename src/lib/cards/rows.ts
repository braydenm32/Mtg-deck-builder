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

/** Can this card be a commander? Legendary creature on the front face, or rules text says so. */
export function canBeCommander(c: Pick<ScryfallCard, "type_line" | "oracle_text" | "card_faces">): boolean {
  const frontType = c.card_faces?.[0]?.type_line ?? c.type_line ?? "";
  const front = frontType.split(" // ")[0];
  if (/\bLegendary\b/.test(front) && /\bCreature\b/.test(front)) return true;
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
    updatedAt: now,
  };
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
    finishes: c.finishes ?? ["nonfoil"],
    tcgplayerId: c.tcgplayer_id ?? null,
    releasedAt: c.released_at ?? null,
    ...images(c),
    priceUsd: price(c.prices?.usd),
    priceUsdFoil: price(c.prices?.usd_foil),
    priceUsdEtched: price(c.prices?.usd_etched),
    updatedAt: now,
  };
}
