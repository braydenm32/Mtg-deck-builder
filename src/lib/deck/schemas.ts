import { z } from "zod";

const status = z.enum(["idea", "building", "built", "retired"]);
const acquire = z.enum(["buy", "proxy"]).nullable();

export const buildSettingsSchema = z.object({
  suggestUnowned: z.boolean().optional(),
  maxPrice: z.number().positive().optional(),
  targetBracket: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]).optional(),
  targets: z
    .object({
      lands: z.number().int().min(20).max(50),
      ramp: z.number().int().min(0).max(25),
      draw: z.number().int().min(0).max(25),
      removal: z.number().int().min(0).max(25),
      wipe: z.number().int().min(0).max(10),
    })
    .partial()
    .optional(),
});

export const createDeckSchema = z.object({
  commanderOracleId: z.string().min(1),
  partnerOracleId: z.string().min(1).nullable().optional(),
  theme: z.string().min(1).max(80).nullable().optional(),
  name: z.string().max(120).optional(),
  status: status.optional(),
  settings: buildSettingsSchema.optional(),
});

export const updateDeckSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  notes: z.string().max(5000).optional(),
  theme: z.string().min(1).max(80).nullable().optional(),
  status: status.optional(),
  /** Merged into the deck's saved build settings. */
  settings: buildSettingsSchema.optional(),
  /** My decks' folder for the deck; "" or null takes it out of its folder. */
  folder: z.string().trim().max(40).nullable().optional(),
  pinned: z.boolean().optional(),
});

export const addDeckCardSchema = z.object({
  oracleId: z.string().min(1),
  board: z.enum(["main", "maybe"]).optional(),
  acquire: acquire.optional(),
});

const ROLE_NAMES = ["land", "ramp", "draw", "removal", "wipe", "tutor", "counter", "protection", "recursion"] as const;

export const updateDeckCardSchema = z.object({
  /** The card's roles in this deck, or null to go back to the automatic ones. */
  roles: z.array(z.enum(ROLE_NAMES)).max(ROLE_NAMES.length).nullable().optional(),
  /** Your own labels; trimmed, at most 8, each up to 30 characters. */
  tags: z.array(z.string().trim().min(1).max(30)).max(8).optional(),
  locked: z.boolean().optional(),
  board: z.enum(["main", "maybe"]).optional(),
  acquire: acquire.optional(),
  quantity: z.number().int().min(1).max(99).optional(),
  /** The printing whose picture the deck shows (a Scryfall ID), or null for the card's usual one. */
  printingId: z.string().uuid().nullable().optional(),
});

export const moveSharedSchema = z.object({ oracleId: z.string().min(1), deckId: z.number().int().positive() });
