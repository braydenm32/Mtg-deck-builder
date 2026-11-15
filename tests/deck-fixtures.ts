import fs from "node:fs";
import path from "node:path";
import { toCardRow } from "@/lib/cards/rows";
import type { ScryfallCard } from "@/lib/scryfall/client";
import type { DeckCardInput, DeckEntry } from "@/lib/deck/types";

const raw = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", "deck-cards.json"), "utf8")) as (ScryfallCard & {
  produced_mana?: string[];
})[];

/** Real cards (from Scryfall, via the same row mapping the app uses), keyed by name and front-face name. */
export const CARDS = new Map<string, DeckCardInput>();
for (const c of raw) {
  const row = toCardRow(c, "2026-01-01T00:00:00Z");
  if (!row) continue;
  const card: DeckCardInput = {
    name: row.name,
    manaCost: row.manaCost ?? null,
    cmc: row.cmc ?? 0,
    typeLine: row.typeLine ?? "",
    oracleText: row.oracleText ?? "",
    colorIdentity: row.colorIdentity ?? "",
    colors: row.colors ?? "",
    keywords: row.keywords ?? [],
    layout: row.layout ?? "normal",
    legalCommander: row.legalCommander ?? "not_legal",
    canBeCommander: row.canBeCommander ?? false,
    gameChanger: row.gameChanger ?? false,
    edhrecRank: row.edhrecRank ?? null,
    cardFaces: row.cardFaces ?? null,
    priceUsd: row.priceUsd ?? null,
  };
  CARDS.set(card.name, card);
  const front = card.name.split(" // ")[0];
  if (front !== card.name) CARDS.set(front, card);
}

export function card(name: string): DeckCardInput {
  const c = CARDS.get(name);
  if (!c) throw new Error(`fixture has no card named ${name}; add it to scripts/make-deck-fixtures.mts`);
  return c;
}

export function entries(spec: Record<string, number> | string[], board: DeckEntry["board"] = "main"): DeckEntry[] {
  const pairs = Array.isArray(spec) ? spec.map((n) => [n, 1] as const) : Object.entries(spec);
  return pairs.map(([name, quantity]) => ({ card: card(name), quantity, board }));
}
