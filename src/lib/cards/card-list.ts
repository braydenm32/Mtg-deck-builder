import type { NameRow } from "./name-cache";
import type { CardListRow } from "./name-search";
import { NON_DECK_LAYOUTS } from "./rows";

const built = new WeakMap<readonly NameRow[], { etag: string; body: string }>();

/**
 * The card list the device keeps (GET /api/cards/names): every card you can put in a deck, most
 * popular first, as JSON, with a tag that changes when the list does (FNV-1a over every row). Built
 * once per name cache.
 */
export function cardList(rows: readonly NameRow[]): { etag: string; body: string } {
  const hit = built.get(rows);
  if (hit) return hit;
  let h = 0x811c9dc5;
  const cards: CardListRow[] = [];
  for (const r of rows) {
    if (NON_DECK_LAYOUTS.includes(r.layout)) continue;
    cards.push([r.oracleId, r.name, r.typeLine, r.colorIdentity, r.canBeCommander && r.legalCommander === "legal" ? 1 : 0]);
    const s = `${r.oracleId}\t${r.name}\t${r.typeLine}\t${r.colorIdentity}\t${cards[cards.length - 1][4]}`;
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  }
  const out = { etag: `"${(h >>> 0).toString(36)}-${cards.length}"`, body: JSON.stringify({ cards }) };
  built.set(rows, out);
  return out;
}
