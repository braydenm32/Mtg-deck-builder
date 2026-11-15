/**
 * Decklist text in and out: paste a list from Moxfield, Archidekt, MTG Arena, MTGO, TappedOut or plain
 * text, and export to the same formats. Pure text handling; matching names to cards is the caller's job
 * (lib/cards/match.ts), so this works for cards that aren't in the local database yet.
 *
 * Understood on input:
 *   1 Sol Ring                         plain
 *   1x Sol Ring (C21) 263 *F*          Moxfield / Archidekt with set, number and foil (*F*, *E*, (F))
 *   Commander / Deck / Sideboard ...   section headers, with or without a colon or count: "Commander (1)"
 *   1x Atraxa ... [Commander{top}]     Archidekt categories; [Maybeboard] and [Sideboard] too
 *   1 Atraxa ... *CMDR*                TappedOut commander marker
 *   Commander: Atraxa, Praetors' Voice one-line commander
 *   // Ramp, # notes                   comments (Archidekt/Moxfield category comments become tags)
 */
import type { Finish } from "@/lib/cards/identity";
import type { DeckEntry } from "./types";

export type Board = NonNullable<DeckEntry["board"]>;

export type DecklistLine = {
  lineNumber: number;
  name: string;
  quantity: number;
  board: Board;
  setCode?: string;
  collectorNumber?: string;
  finish: Finish;
  /** Archidekt categories or "// Category" comments the line sat under. */
  tags: string[];
};

export type ParsedDecklist = {
  lines: DecklistLine[];
  skipped: { lineNumber: number; raw: string }[];
  /** True when nothing marked a commander; the caller should ask, or guess from legendary creatures. */
  noCommanderMarked: boolean;
};

const SECTION: [RegExp, Board | "skip"][] = [
  [/^commanders?$/i, "commander"],
  [/^companions?$/i, "companion"],
  [/^(?:deck|main|main ?deck|mainboard|library|the 99)$/i, "main"],
  [/^(?:sideboard|side ?board)$/i, "side"],
  [/^(?:maybe ?board|maybe|considering|wishlist)$/i, "maybe"],
  [/^(?:tokens?|attractions?|stickers?|about)$/i, "skip"],
];

function section(line: string): Board | "skip" | undefined {
  const h = line.replace(/^\/\/\s*/, "").replace(/:\s*$/, "").replace(/\s*\(\d+\)\s*$/, "").replace(/:\s*$/, "").trim();
  for (const [re, board] of SECTION) if (re.test(h)) return board;
  return undefined;
}

const CATEGORY_BOARDS: [RegExp, Board][] = [
  [/^commander/i, "commander"],
  [/^companion/i, "companion"],
  [/^maybe ?board|^considering/i, "maybe"],
  [/^sideboard/i, "side"],
];

const LINE =
  /^(?:(\d+)\s*x?\s+)?(.+?)(?:\s+[([]([A-Za-z0-9]{2,8})[)\]](?:\s+([A-Za-z0-9★†\-]+))?)?(?:\s+(?:\*(F|E|Foil|Etched)\*|\((F|E|Foil|Etched)\)))?\s*$/i;

export function parseDecklist(text: string): ParsedDecklist {
  const lines: DecklistLine[] = [];
  const skipped: ParsedDecklist["skipped"] = [];
  let board: Board | "skip" = "main";
  let tag: string | undefined;
  let sawHeader = false;
  let block = 0;
  let explicitCommander = false;
  const blockOf: number[] = [];

  text.split(/\r?\n/).forEach((rawLine, i) => {
    let line = rawLine.replace(/^﻿/, "").trim();
    if (!line) {
      if (lines.length && blockOf.at(-1) === block) block++;
      return;
    }
    const sec = section(line);
    if (sec) {
      board = sec;
      tag = undefined;
      sawHeader = true;
      if (sec === "commander") explicitCommander = true;
      return;
    }
    const inline = line.match(/^commanders?\s*:\s*(.+)$/i);
    if (inline) {
      sawHeader = true;
      for (const name of inline[1].split(/\s*(?:\+|&| and |\/\/(?= ))\s*/)) {
        if (!name) continue;
        lines.push({ lineNumber: i + 1, name: name.trim(), quantity: 1, board: "commander", finish: "nonfoil", tags: [] });
        blockOf.push(block);
      }
      explicitCommander = true;
      return;
    }
    if (/^(?:\/\/|#)/.test(line)) {
      tag = line.replace(/^(?:\/\/|#)\s*/, "").replace(/\s*\(\d+\)\s*$/, "").trim() || undefined;
      return;
    }
    if (board === "skip") return;

    // Archidekt categories: "[Ramp,Commander{top}]", tags "^Have,#37d67a^".
    let lineBoard: Board = board;
    const tags = tag ? [tag] : [];
    line = line.replace(/\s+\^[^^]*\^\s*$/, "").trim();
    const cat = line.match(/\s+\[([^\]]+)\]\s*$/);
    if (cat) {
      line = line.slice(0, cat.index).trim();
      for (const c of cat[1].split(",").map((s) => s.replace(/\{[^}]*\}/g, "").trim()).filter(Boolean)) {
        const b = CATEGORY_BOARDS.find(([re]) => re.test(c));
        if (b) {
          lineBoard = b[1];
          if (b[1] === "commander") explicitCommander = true;
        } else tags.push(c);
      }
    }
    if (/\s\*CMDR\*\s*$/i.test(line)) {
      line = line.replace(/\s\*CMDR\*\s*$/i, "").trim();
      lineBoard = "commander";
      explicitCommander = true;
    }

    const m = LINE.exec(line);
    if (!m || !m[2] || /^\d+$/.test(m[2].trim())) {
      skipped.push({ lineNumber: i + 1, raw: rawLine });
      return;
    }
    const [, qty, name, set, num, foilA, foilB] = m;
    const foil = foilA ?? foilB;
    lines.push({
      lineNumber: i + 1,
      name: name.trim().replace(/\s+\/\s+(?!\/)/, " // ").replace(/\s*\/\/\s*/, " // "),
      quantity: qty ? Number(qty) : 1,
      board: lineBoard,
      setCode: set?.toLowerCase(),
      collectorNumber: num,
      finish: !foil ? "nonfoil" : /^e/i.test(foil) ? "etched" : "foil",
      tags,
    });
    blockOf.push(block);
  });

  // MTGO-style lists have no headers: the block after the last blank line is the sideboard.
  const lastBlock = blockOf.at(-1) ?? 0;
  if (!sawHeader && !explicitCommander && lastBlock > 0) {
    lines.forEach((l, i) => {
      if (blockOf[i] === lastBlock && l.board === "main") l.board = "side";
    });
  }

  // MTGO commander decks: no headers, commander(s) as a trailing block of 1-2 cards after a blank line.
  if (!explicitCommander) {
    const side = lines.filter((l) => l.board === "side");
    const sideCount = side.reduce((n, l) => n + l.quantity, 0);
    const mainCount = lines.filter((l) => l.board === "main").reduce((n, l) => n + l.quantity, 0);
    if (sideCount >= 1 && sideCount <= 2 && mainCount + sideCount === 100) {
      for (const l of side) l.board = "commander";
      explicitCommander = true;
    }
  }

  return { lines, skipped, noCommanderMarked: !explicitCommander };
}

export type ExportFormat = "text" | "moxfield" | "archidekt" | "arena" | "mtgo";

export type ExportLine = {
  name: string;
  quantity: number;
  board?: Board;
  setCode?: string;
  collectorNumber?: string;
  finish?: Finish;
  /** Scryfall layout: Arena and MTGO want only the front name of a double-faced card. */
  layout?: string;
  /** Archidekt category, e.g. the card's main role. */
  category?: string;
};

const DOUBLE_FACED = new Set(["transform", "modal_dfc", "flip", "adventure", "meld", "reversible_card"]);

function nameFor(l: ExportLine, format: ExportFormat): string {
  if ((format === "arena" || format === "mtgo") && l.layout && DOUBLE_FACED.has(l.layout)) return l.name.split(" // ")[0];
  if (format === "mtgo" && l.layout === "split") return l.name.replace(" // ", "/");
  return l.name;
}

function printing(l: ExportLine, format: ExportFormat): string {
  if (format === "text" || format === "mtgo" || !l.setCode) return "";
  const set = format === "archidekt" ? l.setCode.toLowerCase() : l.setCode.toUpperCase();
  return ` (${set})${l.collectorNumber ? ` ${l.collectorNumber}` : ""}`;
}

function finishMark(l: ExportLine, format: ExportFormat): string {
  if (format === "arena" || format === "mtgo" || format === "text") return "";
  return l.finish === "foil" ? " *F*" : l.finish === "etched" ? " *E*" : "";
}

/** Render a decklist. Commanders first; maybe/sideboard last (MTGO puts commanders in the sideboard block). */
export function exportDecklist(lines: readonly ExportLine[], format: ExportFormat = "text"): string {
  const by = (b: Board) => lines.filter((l) => (l.board ?? "main") === b);
  const render = (l: ExportLine) => {
    const qty = format === "archidekt" ? `${l.quantity}x` : `${l.quantity}`;
    const cat = format === "archidekt" ? archidektCategory(l) : "";
    return `${qty} ${nameFor(l, format)}${printing(l, format)}${finishMark(l, format)}${cat}`;
  };
  const block = (title: string | null, ls: ExportLine[]) => (ls.length ? [...(title ? [title] : []), ...ls.map(render)].join("\n") : "");

  const commanders = by("commander");
  const companion = by("companion");
  const main = by("main");
  const side = by("side");
  const maybe = by("maybe");

  let parts: string[];
  switch (format) {
    case "arena":
      parts = [block("Commander", commanders), block("Companion", companion), block("Deck", main), block("Sideboard", side)];
      break;
    case "mtgo":
      // MTGO: main deck, blank line, then the command zone as the "sideboard".
      parts = [block(null, main), block(null, [...commanders, ...companion])];
      break;
    case "archidekt":
      parts = [block(null, [...commanders, ...companion, ...main, ...side, ...maybe])];
      break;
    default:
      parts = [block("Commander", commanders), block("Companion", companion), block("Deck", main), block("Sideboard", side), block("Maybeboard", maybe)];
  }
  return parts.filter(Boolean).join("\n\n") + "\n";
}

function archidektCategory(l: ExportLine): string {
  const board = l.board ?? "main";
  const cats = [
    board === "commander" ? "Commander{top}" : board === "companion" ? "Companion" : board === "maybe" ? "Maybeboard{noDeck}{noPrice}" : board === "side" ? "Sideboard{noDeck}" : l.category,
  ].filter(Boolean);
  return cats.length ? ` [${cats.join(",")}]` : "";
}

/** DeckEntry list → export lines (no printing info; the caller can add set and number from the owned copy). */
export function entriesToExportLines(entries: readonly DeckEntry[]): ExportLine[] {
  return entries.map((e) => ({ name: e.card.name, quantity: e.quantity, board: e.board ?? "main", layout: e.card.layout }));
}
