import type { CandidateScore, ScanResult } from "@/scanner/identify";
import type { FinishSetting, FoilVerdict } from "@/scanner/finish";
import type { Printing } from "@/scanner/lookup";

export type { CandidateScore, FinishSetting, FoilVerdict, Printing, ScanResult };

export type Finish = "nonfoil" | "foil" | "etched";

/** Choices that stick between scans (most people scan a pile of the same finish and condition). */
export interface ScanSettings {
  /** "auto": watch the card move and look for foil's rainbow sheen (see scanner/foil.ts). */
  finish: FinishSetting;
  condition: string;
  location: string;
  /** Add confident matches straight away (with Undo) instead of asking each time. */
  autoAdd: boolean;
  /** Scanning tower: the phone looks down a tower and cards drop onto a pile (see scanner/tower.ts). */
  tower: boolean;
  /** Keep the phone's torch on (where the browser can switch it). */
  torch: boolean;
  /** A sound and a buzz for each card (saved, or needs a check). */
  sound: boolean;
  /** Where cards go: "collection", "wants" (the want list, not the collection) or "deck:<id>" (the collection and that deck). */
  into?: string;
}

/** A deck the scanner can add cards to. */
export type ScanDeck = { id: number; name: string };

export type ScanTarget = { kind: "collection" } | { kind: "wants" } | { kind: "deck"; deckId: number; name: string };

/** The setting as a target; a deck that's gone falls back to the collection. */
export function scanTarget(into: string | undefined, decks: readonly ScanDeck[]): ScanTarget {
  if (into === "wants") return { kind: "wants" };
  const m = /^deck:(\d+)$/.exec(into ?? "");
  const deck = m ? decks.find((d) => d.id === Number(m[1])) : undefined;
  return deck ? { kind: "deck", deckId: deck.id, name: deck.name } : { kind: "collection" };
}

export const DEFAULT_SETTINGS: ScanSettings = { finish: "nonfoil", condition: "NM", location: "", autoAdd: true, tower: false, torch: false, sound: true };

/** One card added during this scanning session. */
export interface SessionEntry {
  key: string;
  itemId: number;
  printing: Printing;
  finish: Finish;
  /** Scryfall language code of the physical card ("ja" for a Japanese card of an English-only printing row). Missing on entries saved before languages were tracked. */
  lang?: string;
  condition: string;
  location: string;
  confidence: "exact" | "guessed";
  addedAt: number;
  /** The scan this came from, so "Fix" can offer the other printings again. */
  scan?: ScanResult;
  /** Tower mode: this card's place in the pile, counting from the first card dropped (1). */
  pile?: number;
  /** Where it went besides the collection, and what Undo needs: the deck row it made, or the want count before. */
  into?: { kind: "deck"; deckId: number; deck: string; cardId: number | null } | { kind: "wants"; previous: number };
}

/** A scan waiting for the user: not sure which card or printing, or not found. */
export interface ReviewItem {
  key: string;
  scan: ScanResult;
  /** Small preview of what was photographed (object URL). */
  preview?: string;
  /** When fixing an entry already added, the entry being replaced. */
  replaces?: SessionEntry;
  /** What the camera made of foil (finish setting Auto), when it looked. */
  foil?: FoilVerdict;
  /** Everything else was sure; only foil or not is left to answer. */
  askFinish?: boolean;
  /** Tower mode: this card's place in the pile, counting from the first card dropped (1). */
  pile?: number;
}

/** What one copy is worth in its finish (US dollars), falling back to the non-foil price. */
export function priceOf(p: Printing, finish: Finish): number | null {
  const f = p.prices?.[finish];
  return f ?? p.prices?.nonfoil ?? null;
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
