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
    /**
     * Tokens and emblems the card makes (Scryfall's all_parts with component "token"): the token
     * printing's Scryfall ID and name. Null until the card data is downloaded again after this column
     * was added; [] when it makes none.
     */
    tokens: text("tokens", { mode: "json" }).$type<{ id: string; name: string }[] | null>(),
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
    // Pre-2015 cards print only "74/175" with no set code, so the scanner looks a number up across sets.
    index("printings_num_idx").on(t.collectorNumber),
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
  /** This source's collection rows as they were before the import, for Undo. */
  snapshot: text("snapshot", { mode: "json" }).$type<Record<string, unknown>[]>(),
  undoneAt: text("undone_at"),
  /** What the import did, kept for the review page: see ImportResult in lib/collection/import.ts. */
  result: text("result", { mode: "json" }).$type<Record<string, unknown>>(),
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
    /** Why a guess was made, e.g. "No PELD #303s; used MUL #4 (same card)". */
    matchNote: text("match_note").notNull().default(""),
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
      // Stacks from different sources stay separate, so re-importing one app's export never
      // touches cards you scanned or added by hand.
      t.source,
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
  /** Set when you've dealt with the row: "added" (you added the card another way) or "not-owned". */
  resolution: text("resolution"),
  resolvedAt: text("resolved_at"),
});

/** Cards you want that no deck asks for (the want list's own adds): how many more copies to get. */
export const wants = sqliteTable("wants", {
  oracleId: text("oracle_id").primaryKey(),
  quantity: integer("quantity").notNull().default(1),
  addedAt: text("added_at").notNull(),
});

/** Small key/value store: bulk sync timestamps and similar bookkeeping. */
export const meta = sqliteTable("meta", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

/** Cached EDHREC JSON pages (commander, commander + theme, theme/tag), refreshed after a week. */
export const edhrecCache = sqliteTable("edhrec_cache", {
  key: text("key").primaryKey(), // e.g. "commanders/korvold-fae-cursed-king/aristocrats"
  json: text("json").notNull(),
  fetchedAt: text("fetched_at").notNull(),
  /** HTTP status of the last fetch; 404 is cached too so we don't keep asking. */
  status: integer("status").notNull().default(200),
});

export const decks = sqliteTable("decks", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  commanderOracleId: text("commander_oracle_id").notNull(),
  /** Second commander for partner / background / friends forever pairs. */
  partnerOracleId: text("partner_oracle_id"),
  /** EDHREC theme slug, e.g. "aristocrats", or null for a general build. */
  theme: text("theme"),
  colorIdentity: text("color_identity").notNull().default(""),
  notes: text("notes").notNull().default(""),
  /**
   * idea: just a list, claims no copies. building / built: claims the copies placed in it.
   * retired: keeps the list but releases its copies (decks are archived, never deleted by default).
   */
  status: text("status").$type<"idea" | "building" | "built" | "retired">().notNull().default("building"),
  /** Builder settings used for the last build (targets, suggestUnowned, maxPrice). */
  settings: text("settings", { mode: "json" }).$type<Record<string, unknown>>().notNull().default(sql`'{}'`),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

/**
 * Cards in a deck. Owned cards point at the physical stack they come from (`collectionItemId`),
 * so a copy can't silently be in two decks. Cards you don't own are suggestions to buy or proxy.
 */
export const deckCards = sqliteTable(
  "deck_cards",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    deckId: integer("deck_id").notNull(),
    oracleId: text("oracle_id").notNull(),
    quantity: integer("quantity").notNull().default(1),
    /** "main" (the 99), "maybe" (considering), "wanted" (the builder wanted it but every copy is in another deck) */
    board: text("board").notNull().default("main"),
    /** Main role: land, ramp, draw, removal, wipe, tutor, counter, protection, theme, other */
    role: text("role").notNull().default("other"),
    /** Null when the card comes from the collection; otherwise "buy" or "proxy" (a suggestion). */
    acquire: text("acquire"),
    collectionItemId: integer("collection_item_id"),
    /** Kept by the user: rebuilding the deck won't remove it. */
    locked: integer("locked", { mode: "boolean" }).notNull().default(false),
    addedBy: text("added_by").notNull().default("builder"),
    score: real("score"),
    /** EDHREC synergy with this commander (-1..1), used to decide which deck gets a shared card. */
    synergy: real("synergy"),
    reason: text("reason").notNull().default(""),
    /** Roles you set for this card in this deck (replaces the automatic ones; [] = none). Null = automatic. */
    roles: text("roles", { mode: "json" }).$type<string[] | null>(),
    /** Your own labels for the card in this deck ("Wincon", "Swap out"). */
    tags: text("tags", { mode: "json" }).$type<string[] | null>(),
  },
  (t) => [index("deck_cards_deck_idx").on(t.deckId), index("deck_cards_oracle_idx").on(t.oracleId)],
);
