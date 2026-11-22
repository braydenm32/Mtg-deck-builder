import type { decks } from "@/db/schema";
import type { Bracket } from "./bracket";
import type { Targets } from "./build";

/*
 * A deck's status labels and build settings, with no database code, so pages drawn on the device
 * (src/components/offline/DeviceTabs.tsx) can use them too. src/lib/deck/store.ts re-exports them.
 */

export type DeckStatus = (typeof decks.$inferSelect)["status"];
export const STATUS_LABEL: Record<DeckStatus, string> = { idea: "Idea", building: "Building", built: "Built", retired: "Retired" };
/** Decks in these states hold on to the copies placed in them. */
export const CLAIMING: DeckStatus[] = ["building", "built"];

export type BuildSettings = {
  targets?: Partial<Targets>;
  suggestUnowned?: boolean;
  maxPrice?: number;
  /** The Commander bracket this deck aims for. Brayden's pods play Bracket 3, so that's the default. */
  targetBracket?: Bracket;
};

export const DEFAULT_TARGET_BRACKET: Bracket = 3;
export const targetBracketOf = (settings: unknown): Bracket => (settings as BuildSettings | null)?.targetBracket ?? DEFAULT_TARGET_BRACKET;
