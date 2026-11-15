/**
 * Sanity-check the deck modules against real Commander precons from MTGJSON (MIT-licensed):
 * every official precon should be legal, and most should land in Bracket 2 or 3.
 *   NODE_USE_ENV_PROXY=1 npx tsx scripts/check-precons.mts [count=40] [--spellbook]
 * Needs a synced database (npm run sync:cards). Prints decks that come out illegal or unusual.
 * --spellbook takes combos from Commander Spellbook (one request per deck, cached) instead of the built-in list.
 */
import { inArray } from "drizzle-orm";
import { openDb } from "@/db/client";
import { cards } from "@/db/schema";
import { NON_DECK_LAYOUTS } from "@/lib/cards/rows";
import { analyzeDeck } from "@/lib/deck/analyze";
import type { DeckEntry } from "@/lib/deck/types";
import { deckCombos } from "@/lib/spellbook/client";

type MtgjsonCard = { name: string; count: number; faceName?: string };
type MtgjsonDeck = { name: string; code: string; type: string; releaseDate: string; commander?: MtgjsonCard[]; mainBoard: MtgjsonCard[]; fileName?: string };

const args = process.argv.slice(2);
const useSpellbook = args.includes("--spellbook");
const count = Number(args.find((a) => /^\d+$/.test(a)) ?? 40);
const list = (await (await fetch("https://mtgjson.com/api/v5/DeckList.json")).json()) as { data: (MtgjsonDeck & { fileName: string })[] };
const precons = list.data.filter((d) => d.type === "Commander Deck").sort((a, b) => b.releaseDate.localeCompare(a.releaseDate)).slice(0, count);

const db = await openDb();
const tally = new Map<number, number>();
let illegal = 0;
for (const p of precons) {
  const deck = ((await (await fetch(`https://mtgjson.com/api/v5/decks/${p.fileName}.json`)).json()) as { data: MtgjsonDeck }).data;
  const lines = [...(deck.commander ?? []).map((c) => ({ ...c, board: "commander" as const })), ...deck.mainBoard.map((c) => ({ ...c, board: "main" as const }))];
  const names = [...new Set(lines.map((l) => l.name))];
  const rows = await db.select().from(cards).where(inArray(cards.name, names));
  // The cards table also holds token, art-series, theme-card and other non-deck rows that share real cards' names; prefer real cards.
  const junk = (l: string) => NON_DECK_LAYOUTS.includes(l);
  const byName = new Map<string, (typeof rows)[number]>();
  for (const r of rows) if (!byName.has(r.name) || junk(byName.get(r.name)!.layout)) byName.set(r.name, r);
  const missing = names.filter((n) => !byName.has(n));
  const entries: DeckEntry[] = lines.filter((l) => byName.has(l.name)).map((l) => ({ card: byName.get(l.name)!, quantity: l.count, board: l.board }));
  const combos = useSpellbook ? await deckCombos(db, entries) : undefined;
  if (combos && combos.source !== "spellbook") console.log("      (Spellbook unreachable, built-in combos)");
  const a = analyzeDeck(entries, { combos: combos?.combos });
  tally.set(a.bracket.bracket, (tally.get(a.bracket.bracket) ?? 0) + 1);
  const errors = a.validation.issues.filter((i) => i.severity === "error");
  const flag = errors.length || missing.length || a.bracket.bracket >= 4;
  if (errors.length) illegal++;
  console.log(
    `${flag ? "!!" : "ok"} ${p.releaseDate} ${p.code} ${deck.name}: ${a.validation.deckSize} cards, bracket ${a.bracket.bracket}, lands ${a.stats.lands} (advice ${a.stats.landAdvice.recommended}), ramp ${a.stats.roles.ramp}, draw ${a.stats.roles.draw}, removal ${a.stats.roles.removal}, wipes ${a.stats.roles.wipe}`,
  );
  for (const e of errors) console.log("     ", e.code, e.message.slice(0, 200));
  if (missing.length) console.log("      not in DB:", missing.join("; "));
  if (a.bracket.bracket >= 3) for (const r of a.bracket.reasons) console.log("      bracket:", r.message.slice(0, 200));
  const bigger = a.bracket.combos.filter((c) => !c.twoCard);
  if (bigger.length) console.log(`      other combos (${bigger.length}):`, bigger.slice(0, 3).map((c) => c.cards.join(" + ")).join("; "));
}
console.log("\nbrackets:", Object.fromEntries([...tally].sort()), `illegal: ${illegal}/${precons.length}`);
