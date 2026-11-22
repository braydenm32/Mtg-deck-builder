import type { cards } from "@/db/schema";

/**
 * The card fields the deck modules use (see DeckCardInput), in the order GET /api/cards/details/:shard
 * sends them; images are left out. The device keeps them (src/lib/offline/card-details.ts).
 */
export const DETAIL_FIELDS = [
  "oracleId",
  "name",
  "manaCost",
  "cmc",
  "typeLine",
  "oracleText",
  "colors",
  "colorIdentity",
  "keywords",
  "layout",
  "legalCommander",
  "canBeCommander",
  "gameChanger",
  "edhrecRank",
  "cardFaces",
  "priceUsd",
] as const;

/** One card as a row of DETAIL_FIELDS (faces without their images). */
export function detailRow(c: typeof cards.$inferSelect): unknown[] {
  return DETAIL_FIELDS.map((f) => (f === "cardFaces" ? (c.cardFaces?.map(({ name, manaCost, typeLine, oracleText }) => ({ name, manaCost, typeLine, oracleText })) ?? null) : c[f]));
}
