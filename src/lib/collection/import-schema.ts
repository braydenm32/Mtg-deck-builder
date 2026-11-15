import { z } from "zod";

export const importRequestSchema = z.object({
  text: z.string().min(1).max(20_000_000),
  filename: z.string().max(300).optional(),
  mode: z.enum(["add", "update", "replace-source"]).default("add"),
  source: z
    .enum(["mythic-tools", "manabox", "moxfield", "archidekt", "deckbox", "tcgplayer-app", "tcgplayer-inventory", "delver-lens", "dragon-shield", "generic", "text"])
    .optional(),
});
