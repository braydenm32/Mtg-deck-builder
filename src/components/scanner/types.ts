import type { CandidateScore, ScanResult } from "@/scanner/identify";
import type { Printing } from "@/scanner/lookup";

export type { CandidateScore, Printing, ScanResult };

export type Finish = "nonfoil" | "foil" | "etched";

/** Choices that stick between scans (most people scan a pile of the same finish and condition). */
export interface ScanSettings {
  finish: Finish;
  condition: string;
  location: string;
  /** Add confident matches straight away (with Undo) instead of asking each time. */
  autoAdd: boolean;
}

export const DEFAULT_SETTINGS: ScanSettings = { finish: "nonfoil", condition: "NM", location: "", autoAdd: true };

/** One card added during this scanning session. */
export interface SessionEntry {
  key: string;
  itemId: number;
  printing: Printing;
  finish: Finish;
  condition: string;
  location: string;
  confidence: "exact" | "guessed";
  addedAt: number;
  /** The scan this came from, so "Fix" can offer the other printings again. */
  scan?: ScanResult;
}

/** A scan waiting for the user: not sure which card or printing, or not found. */
export interface ReviewItem {
  key: string;
  scan: ScanResult;
  /** Small preview of what was photographed (object URL). */
  preview?: string;
  /** When fixing an entry already added, the entry being replaced. */
  replaces?: SessionEntry;
}

export const printingLabel = (p: Printing) => `${p.set.toUpperCase()} #${p.collectorNumber}`;
