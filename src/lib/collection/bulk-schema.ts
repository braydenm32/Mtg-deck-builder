import { z } from "zod";

/**
 * POST /api/collection/bulk. `query` is the Collection page's query string, so the stacks are exactly
 * the ones that view shows; `oracleIds` narrows it to the cards you ticked (leave it out for "all").
 */
export const bulkRequestSchema = z.object({
  query: z.string().max(2000).default(""),
  oracleIds: z.array(z.string().min(1).max(64)).max(5000).optional(),
  action: z.discriminatedUnion("kind", [
    z.object({
      kind: z.literal("update"),
      patch: z
        .object({ location: z.string().max(120).optional(), condition: z.string().max(40).optional(), proxy: z.boolean().optional() })
        .refine((p) => Object.keys(p).length > 0, "Nothing to change"),
    }),
    z.object({ kind: z.literal("remove") }),
  ]),
  /** Only count what would change. */
  preview: z.boolean().optional(),
});

export const renamePlaceSchema = z.object({ from: z.string().min(1).max(120), to: z.string().trim().min(1).max(120) });
