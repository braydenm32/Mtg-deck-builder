import { sql } from "drizzle-orm";
import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

/**
 * One row per gameplay card (Scryfall "oracle" card). Deckbuilding works at this level:
 * a deck wants "Sol Ring", not a particular printing of it.
 */
export const cards = sqliteTable(
  "cards",
  {
    oracleId: text("oracle_id").primaryKey(),
    name: text("name").notNull(),
    /** Lowercased, accent-stripped, punctuation-light name for matching. */
    normName: text("norm_name").notNull(),
    /** Normalised front-face name, so "Fable of the Mirror-Breaker" matches the full DFC name. */
    normFrontName: text("norm_front_name").notNull(),
    manaCost: text("mana_cost"),
    cmc: real("cmc").notNull().default(0),
    typeLine: text("type_line").notNull().default(""),
    oracleText: text("oracle_text").notNull().default(""),
    /** WUBRG letters in canonical order, e.g. "BG". Empty string = colourless. */
    colors: text("colors").notNull().default(""),
    colorIdentity: text("color_identity").notNull().default(""),
    keywords: text("keywords", { mode: "json" }).$type<string[]>().notNull().default(sql`'[]'`),
    layout: text("layout").notNull().default("normal"),
    legalCommander: text("legal_commander").notNull().default("not_legal"),
    /** True when the card can be your commander (legendary creature, or says so). */
    canBeCommander: integer("can_be_commander", { mode: "boolean" }).notNull().default(false),
    edhrecRank: integer("edhrec_rank"),
    gameChanger: integer("game_changer", { mode: "boolean" }).notNull().default(false),
    /** Has at least one paper printing (set after each sync). Digital-only cards can't be owned. */
    paper: integer("paper", { mode: "boolean" }).notNull().default(true),
    /** Image of the default printing, used when we only know the oracle card. */
    imageNormal: text("image_normal"),
    imageSmall: text("image_small"),
    cardFaces: text("card_faces", { mode: "json" }).$type<CardFace[] | null>(),
    priceUsd: real("price_usd"),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [
    index("cards_norm_name_idx").on(t.normName),
    index("cards_norm_front_name_idx").on(t.normFrontName),
    index("cards_color_identity_idx").on(t.colorIdentity),
  ],
);

export type CardFace = {
  name: string;
  manaCost?: string;
  typeLine?: string;
  oracleText?: string;
  imageNormal?: string;
  imageSmall?: string;
};

/** One row per physical printing (Scryfall card object). Collection items point here. */
export const printings = sqliteTable(
  "printings",
  {
    id: text("id").primaryKey(), // Scryfall ID
    oracleId: text("oracle_id").notNull(),
    name: text("name").notNull(),
    setCode: text("set_code").notNull(),
    setName: text("set_name").notNull(),
    collectorNumber: text("collector_number").notNull(),
    lang: text("lang").notNull().default("en"),
    rarity: text("rarity").notNull().default("common"),
    /** Scryfall set_type: expansion, core, masters, commander, box (Secret Lair), promo, ... */
    setType: text("set_type").notNull().default("expansion"),
    /** 0 for a regular printing; higher for promos, Secret Lair, showcase/borderless, serialized... Used to guess a printing from a name. */
    variantRank: integer("variant_rank").notNull().default(0),
    finishes: text("finishes", { mode: "json" }).$type<string[]>().notNull().default(sql`'["nonfoil"]'`),
    tcgplayerId: integer("tcgplayer_id"),
    releasedAt: text("released_at"),
    imageNormal: text("image_normal"),
    imageSmall: text("image_small"),
    priceUsd: real("price_usd"),
    priceUsdFoil: real("price_usd_foil"),
    priceUsdEtched: real("price_usd_etched"),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [
    index("printings_oracle_idx").on(t.oracleId),
    index("printings_set_num_idx").on(t.setCode, t.collectorNumber),
    index("printings_tcgplayer_idx").on(t.tcgplayerId),
  ],
);

export const importBatches = sqliteTable("import_batches", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  source: text("source").notNull(),
  filename: text("filename"),
  createdAt: text("created_at").notNull(),
  rowCount: integer("row_count").notNull().default(0),
  matchedCount: integer("matched_count").notNull().default(0),
  unmatchedCount: integer("unmatched_count").notNull().default(0),
  /** "add" keeps existing cards; "replace" wiped the collection before this import. */
  mode: text("mode").notNull().default("add"),
});

/**
 * One row per (printing, finish, condition, language, location, flags) stack the user owns.
 * Decks will later point at these rows, so we always know which copies are spoken for.
 */
export const collectionItems = sqliteTable(
  "collection_items",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    printingId: text("printing_id").notNull(),
    oracleId: text("oracle_id").notNull(),
    quantity: integer("quantity").notNull().default(1),
    finish: text("finish").notNull().default("nonfoil"),
    /** Empty string when unknown, so the unique stack index treats it as a value (SQLite NULLs never collide). */
    condition: text("condition").notNull().default(""),
    lang: text("lang").notNull().default("en"),
    /** Box, binder or other container name; empty string when none. */
    location: text("location").notNull().default(""),
    altered: integer("altered", { mode: "boolean" }).notNull().default(false),
    signed: integer("signed", { mode: "boolean" }).notNull().default(false),
    misprint: integer("misprint", { mode: "boolean" }).notNull().default(false),
    proxy: integer("proxy", { mode: "boolean" }).notNull().default(false),
    purchasePrice: real("purchase_price"),
    /**
     * "exact": the source named this printing (Scryfall ID, TCGplayer ID, set + number).
     * "guessed": we only knew the name (or the printing doesn't come in the stated finish), so the UI can ask.
     */
    printingConfidence: text("printing_confidence").notNull().default("exact"),
    /** How this card got here: "csv:mythic-tools", "text", later "scanner". */
    source: text("source").notNull(),
    batchId: integer("batch_id"),
    addedAt: text("added_at").notNull(),
  },
  (t) => [
    index("collection_oracle_idx").on(t.oracleId),
    uniqueIndex("collection_stack_uq").on(
      t.printingId,
      t.finish,
      t.lang,
      t.condition,
      t.location,
      t.altered,
      t.signed,
      t.misprint,
      t.proxy,
    ),
  ],
);

/** Rows we couldn't match to a Scryfall printing, kept for the review screen. */
export const unmatchedRows = sqliteTable("unmatched_rows", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  batchId: integer("batch_id").notNull(),
  rowNumber: integer("row_number").notNull(),
  name: text("name"),
  setCode: text("set_code"),
  collectorNumber: text("collector_number"),
  quantity: integer("quantity").notNull().default(1),
  reason: text("reason").notNull(),
  raw: text("raw", { mode: "json" }).$type<Record<string, string>>().notNull(),
});

/** Small key/value store: bulk sync timestamps and similar bookkeeping. */
export const meta = sqliteTable("meta", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});
