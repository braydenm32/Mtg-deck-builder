import { z } from "zod";

const status = z.enum(["idea", "building", "built", "retired"]);
const acquire = z.enum(["buy", "proxy"]).nullable();

export const buildSettingsSchema = z.object({
  suggestUnowned: z.boolean().optional(),
  maxPrice: z.number().positive().optional(),
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
});

export const addDeckCardSchema = z.object({
  oracleId: z.string().min(1),
  board: z.enum(["main", "maybe"]).optional(),
  acquire: acquire.optional(),
});

export const updateDeckCardSchema = z.object({
  locked: z.boolean().optional(),
  board: z.enum(["main", "maybe"]).optional(),
  acquire: acquire.optional(),
  quantity: z.number().int().min(1).max(99).optional(),
});

export const moveSharedSchema = z.object({ oracleId: z.string().min(1), deckId: z.number().int().positive() });
