import type { CardFace } from "@/db/schema";

/**
 * What the deck modules need to know about a card. It is a structural subset of a `cards` row
 * (`typeof cards.$inferSelect`), so a row can be passed in as is. Everything here is pure data:
 * no module under src/lib/deck/ (other than store/build code owned elsewhere) touches the database.
 */
export type DeckCardInput = {
  name: string;
  manaCost?: string | null;
  cmc: number;
  typeLine: string;
  oracleText: string;
  /** WUBRG letters in canonical order, e.g. "BG". Empty string = colourless. */
  colorIdentity: string;
  colors?: string;
  keywords?: string[];
  layout?: string;
  /** Scryfall Commander legality: "legal" | "not_legal" | "banned" | "restricted". */
  legalCommander?: string;
  canBeCommander?: boolean;
  gameChanger?: boolean;
  edhrecRank?: number | null;
  cardFaces?: CardFace[] | null;
  priceUsd?: number | null;
  /** Roles you set for this card in a deck, replacing the automatic ones (null or absent = automatic). */
  roleOverride?: readonly string[] | null;
  /** Scryfall `produced_mana`, when known (not stored in the DB yet; derived from text otherwise). */
  producedMana?: string[] | null;
};

/** A line of a decklist: a card, how many copies, and which board it sits on. */
export type DeckEntry<C extends DeckCardInput = DeckCardInput> = {
  card: C;
  quantity: number;
  /** "commander" for the commander(s) and a background/companion-in-command-zone; "main" for the 99. */
  board?: "commander" | "main" | "companion" | "maybe" | "side";
};

export const COLORS = ["W", "U", "B", "R", "G"] as const;
export type Color = (typeof COLORS)[number];
