import type { LoadedDeck } from "@/app/decks/[id]/data";

/**
 * A short tag that changes whenever anything the deck's pages show about its cards changes: its
 * status and settings, and each row's board, count, lock, buy/proxy and where its copy comes from.
 * The deck's pages carry it, so the device can tell when its copy of the deck is out of date.
 */
export function deckVersion(v: Pick<LoadedDeck, "deck" | "cards" | "commanderSlots">): string {
  const parts = [v.deck.status, JSON.stringify(v.deck.settings ?? null), v.deck.theme ?? "", v.deck.name];
  for (const c of [...v.commanderSlots, ...v.cards]) parts.push(`${c.id}:${c.board}:${c.quantity}:${c.locked ? 1 : 0}:${c.acquire ?? ""}:${c.state}:${c.location ?? ""}:${c.owned}`);
  let h = 0x811c9dc5;
  const s = parts.join("|");
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return `${(h >>> 0).toString(36)}-${v.cards.length}`;
}
