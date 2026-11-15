import { z } from "zod";

const finish = z.enum(["nonfoil", "foil", "etched"]);

const stackFields = {
  quantity: z.number().int().min(1).max(1000).default(1),
  finish: finish.default("nonfoil"),
  condition: z.string().max(40).optional(),
  location: z.string().max(200).optional(),
  altered: z.boolean().optional(),
  signed: z.boolean().optional(),
  misprint: z.boolean().optional(),
  proxy: z.boolean().optional(),
  purchasePrice: z.number().min(0).optional(),
};

/** A card the caller already identified by Scryfall ID (scanner, manual add). */
export const addPrintingSchema = z.object({
  scryfallId: z.string().uuid(),
  lang: z.string().max(5).optional(),
  ...stackFields,
});

/** A card the server should match (name, set + number, ...). */
export const addEntrySchema = z.object({
  identity: z
    .object({
      scryfallId: z.string().optional(),
      name: z.string().max(200).optional(),
      setCode: z.string().max(10).optional(),
      collectorNumber: z.string().max(20).optional(),
      lang: z.string().max(5).optional(),
      tcgplayerId: z.number().int().optional(),
    })
    .refine((i) => i.scryfallId || i.name || (i.setCode && i.collectorNumber) || i.tcgplayerId, {
      message: "identity needs a scryfallId, name, setCode + collectorNumber, or tcgplayerId",
    }),
  ...stackFields,
});

export const addRequestSchema = z.object({
  source: z.string().max(40).default("manual"),
  cards: z.array(z.union([addPrintingSchema, addEntrySchema])).min(1).max(5000),
});

export const updateItemSchema = z.object({
  quantity: z.number().int().min(0).max(1000),
});
