import type { CardEntry } from "@/lib/cards/identity";

/**
 * Plain-text card lists, as used by Moxfield/Arena/MTGO exports and quick pastes:
 *   4 Sol Ring (C21) 263 *F*
 *   1x Atraxa, Praetors' Voice
 *   Lightning Bolt
 * Section headers ("Commander", "Sideboard", "// Ramp") and blank lines are ignored.
 */
const LINE =
  /^(?:(\d+)\s*x?\s+)?(.+?)(?:\s+\(([A-Za-z0-9]{2,8})\)(?:\s+([A-Za-z0-9★†\-]+))?)?(?:\s+\*(F|E|Foil|Etched)\*)?\s*$/i;
const HEADER = /^(?:\/\/.*|#.*|(?:commander|companion|deck|main ?deck|mainboard|sideboard|maybeboard|considering|tokens?)\s*:?\s*(?:\(\d+\))?)$/i;

export type ParsedLine = { lineNumber: number; entry: CardEntry; raw: string };

export function parseCardList(text: string): { rows: ParsedLine[]; skipped: { lineNumber: number; raw: string }[] } {
  const rows: ParsedLine[] = [];
  const skipped: { lineNumber: number; raw: string }[] = [];
  text.split(/\r?\n/).forEach((rawLine, i) => {
    const line = rawLine.trim();
    if (!line || HEADER.test(line)) return;
    const m = LINE.exec(line);
    if (!m) {
      skipped.push({ lineNumber: i + 1, raw: rawLine });
      return;
    }
    const [, qty, name, set, num, foil] = m;
    const finish = !foil ? "nonfoil" : /^e/i.test(foil) ? "etched" : "foil";
    rows.push({
      lineNumber: i + 1,
      raw: rawLine,
      entry: {
        identity: { name: name.trim(), setCode: set, collectorNumber: num },
        quantity: qty ? Number(qty) : 1,
        finish,
      },
    });
  });
  return { rows, skipped };
}

/** Heuristic: does this text look like a CSV (header row with commas or tabs) rather than a card list? */
export function looksLikeCsv(text: string): boolean {
  const first = text.replace(/^﻿/, "").split(/\r?\n/).find((l) => l.trim()) ?? "";
  if (/^sep=/i.test(first)) return true;
  const cells = first.split(/[,;\t]/);
  return cells.length >= 2 && cells.some((c) => /^"?(name|card name|count|quantity|qty|scryfall id)"?$/i.test(c.trim()));
}
