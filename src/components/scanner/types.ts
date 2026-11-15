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
  /** Scryfall language code of the physical card ("ja" for a Japanese card of an English-only printing row). */
  lang: string;
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

/** Languages Magic is printed in (Scryfall codes), for the review sheet. */
export const LANGUAGES: { code: string; label: string }[] = [
  { code: "en", label: "English" },
  { code: "ja", label: "Japanese" },
  { code: "zhs", label: "Chinese (Simplified)" },
  { code: "zht", label: "Chinese (Traditional)" },
  { code: "ko", label: "Korean" },
  { code: "de", label: "German" },
  { code: "fr", label: "French" },
  { code: "it", label: "Italian" },
  { code: "es", label: "Spanish" },
  { code: "pt", label: "Portuguese" },
  { code: "ru", label: "Russian" },
  { code: "ph", label: "Phyrexian" },
];

export const langLabel = (code: string) => (code === "en" ? "" : code.toUpperCase());
