import type { DeckRow, LoadedDeck } from "@/app/decks/[id]/data";
import { isBasicLand } from "@/lib/deck/build";
import { cardRoles } from "@/lib/deck/roles";
import type { OwnedRow } from "@/lib/deck/store";
import type { DeckCardInput } from "@/lib/deck/types";
import type { DeckEdit } from "./deck-edits";

/**
 * A deck as edits leave it, worked out on the device: the rows, each row's slot state, the progress
 * and the cost to finish, so the deck's tabs can show their numbers while edits wait to be sent
 * (src/components/offline/DeviceDeck.tsx). Pure, and the same rules as the server's (addDeckCard,
 * updateDeckCard, removeDeckCard, restoreDeckCard and placeCopies in src/lib/deck/store.ts), except
 * that a copy the server would place is shown placed without saying which box it's in.
 */

/** What the deck modules need about a card (GET /api/cards/details/:shard). */
export type CardDetail = DeckCardInput & { oracleId: string };

/** What you own and where copies are placed (GET /api/collection/owned). */
export type OwnedIndex = { decks: ReadonlyMap<number, string>; cards: ReadonlyMap<string, OwnedRow> };

/** A row the device added: its id is negative until the server has it, and `pendingKey` is the add's. */
export type DeviceRow = DeckRow & { pendingKey?: string };

export type DeviceDeck = Omit<LoadedDeck, "cards"> & { cards: DeviceRow[] };

/** A stable negative id for a row added on the device (from its edit's key). */
export function pendingRowId(key: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 0x01000193);
  return -((h >>> 1) + 1);
}

const anyNumber = (name: string, oracleText: string) => isBasicLand(name) || /a deck can have any number of cards named/i.test(oracleText);

function primaryRole(card: DeckCardInput): string {
  if (/\bLand\b/.test(card.typeLine.split(" // ")[0])) return "land";
  return cardRoles(card)[0] ?? "other";
}

type Ownership = Pick<DeckRow, "state" | "owned" | "ownedReal" | "inDecks" | "free">;

/** A card's slot state from what you own, as deckView() works it out after placeCopies(). */
function ownership(v: Pick<LoadedDeck, "deck" | "claiming">, oracleId: string, basic: boolean, known: boolean, board: string, quantity: number, owned?: OwnedIndex): Ownership {
  const o = owned?.cards.get(oracleId);
  const elsewhere = (o?.[4] ?? []).filter(([id]) => id !== v.deck.id);
  const inDecks = elsewhere.map(([id]) => ({ id, name: owned?.decks.get(id) ?? "another deck" }));
  const have = o?.[1] ?? 0;
  const free = Math.max(0, have - elsewhere.reduce((n, [, q]) => n + q, 0));
  const base = { owned: have, ownedReal: o?.[2] ?? 0, inDecks };
  if (!known && !basic) return { ...base, state: "no-data", free };
  if (basic) return { ...base, state: "placed", free };
  // A deck you're building holds a free copy of a card in its 99.
  if (v.claiming && board === "main" && free > 0) return { ...base, state: "placed", free: Math.max(0, free - quantity) };
  if (!have) return { ...base, state: "not-owned", free };
  if (free > 0) return { ...base, state: (o?.[3] ?? 0) > have ? "shared" : "free", free };
  return { ...base, state: "other-deck", free };
}

/** A row moved to `board`: a deck you're building takes a free copy for its 99 (and it's no longer a buy). */
function moved(v: Pick<LoadedDeck, "claiming">, row: DeviceRow, board: DeckRow["board"]): DeviceRow {
  const next = { ...row, board };
  if (v.claiming && board === "main" && (row.state === "free" || row.state === "shared")) {
    return { ...next, state: "placed", acquire: null, free: Math.max(0, row.free - row.quantity) };
  }
  return next;
}

function newRow(
  v: Pick<LoadedDeck, "deck" | "claiming">,
  id: number,
  oracleId: string,
  name: string,
  board: DeckRow["board"],
  d: CardDetail | undefined,
  owned: OwnedIndex | undefined,
  fields: Partial<Pick<DeckRow, "quantity" | "role" | "acquire" | "locked" | "addedBy" | "score" | "synergy" | "reason">> = {},
): DeviceRow {
  const cardName = d?.name ?? name;
  const basic = isBasicLand(cardName);
  const quantity = fields.quantity ?? 1;
  const own = ownership(v, oracleId, basic, !!d, board, quantity, owned);
  return {
    id,
    oracleId,
    name: cardName,
    quantity,
    board,
    role: fields.role ?? (d ? primaryRole(d) : basic ? "land" : "other"),
    acquire: own.state === "placed" ? null : (fields.acquire ?? null),
    locked: fields.locked ?? true,
    addedBy: fields.addedBy ?? "user",
    score: fields.score ?? null,
    synergy: fields.synergy ?? null,
    reason: fields.reason ?? "Added by you",
    typeLine: d?.typeLine ?? (basic ? "Basic Land" : ""),
    manaCost: d?.manaCost ?? null,
    cmc: d?.cmc ?? 0,
    oracleText: d?.oracleText ?? "",
    colorIdentity: d?.colorIdentity ?? "",
    gameChanger: d?.gameChanger ?? false,
    imageSmall: null,
    imageNormal: null,
    priceUsd: d?.priceUsd ?? null,
    keywords: d?.keywords ?? [],
    layout: d?.layout ?? "normal",
    cardFaces: d?.cardFaces ?? null,
    basic,
    ...own,
    location: null,
    placedFinish: null,
    placedProxy: false,
    placedPrinting: null,
    placedSet: null,
    placedNumber: null,
  };
}

/**
 * The deck after `edits`, in order. `details` has the card data for cards added that the deck didn't
 * have rows for; `owned` says whether you have copies of them. Rows an edit names that aren't there
 * are skipped (the edit already happened, or the row went on another device).
 */
export function applyDeckEdits(
  base: LoadedDeck,
  edits: readonly DeckEdit[],
  ctx: { details?: ReadonlyMap<string, CardDetail>; owned?: OwnedIndex } = {},
): DeviceDeck {
  let rows: DeviceRow[] = [...base.cards];
  const gone = new Map<number, DeviceRow>();
  for (const e of edits) {
    if (e.deckId !== base.deck.id) continue;
    if (e.kind === "remove") {
      const row = rows.find((r) => r.id === e.rowId);
      if (row) gone.set(row.id, row);
      rows = rows.filter((r) => r.id !== e.rowId);
    } else if (e.kind === "patch") {
      rows = rows.map((r) => {
        if (r.id !== e.rowId) return r;
        let next: DeviceRow = r;
        if (e.patch.board !== undefined && e.patch.board !== r.board) next = moved(base, next, e.patch.board);
        if (e.patch.locked !== undefined) next = { ...next, locked: e.patch.locked };
        // A placed copy is never a buy or a proxy (placeCopies clears it).
        if (e.patch.acquire !== undefined) next = { ...next, acquire: next.state === "placed" && !next.basic ? null : e.patch.acquire };
        return next;
      });
    } else if (e.kind === "restore") {
      const id = e.removed.id;
      if (rows.some((r) => r.id === id)) continue;
      const r = e.removed as { quantity?: number; board: string; role?: string; acquire?: string | null; locked?: boolean; addedBy?: string; score?: number | null; synergy?: number | null; reason?: string };
      const before = gone.get(id);
      rows.push(
        before ??
          newRow(base, id, e.removed.oracleId, e.name, r.board as DeckRow["board"], ctx.details?.get(e.removed.oracleId), ctx.owned, {
            quantity: r.quantity,
            role: r.role,
            acquire: (r.acquire as DeckRow["acquire"]) ?? null,
            locked: r.locked,
            addedBy: r.addedBy,
            score: r.score,
            synergy: r.synergy,
            reason: r.reason,
          }),
      );
    } else if (e.kind === "add") {
      const at = rows.findIndex((r) => r.oracleId === e.oracleId && ["main", "maybe", "wanted", "upgrade"].includes(r.board));
      const existing = at >= 0 ? rows[at] : undefined;
      if (existing) {
        let next: DeviceRow;
        if (existing.board === e.board && anyNumber(existing.name, existing.oracleText)) next = { ...existing, quantity: existing.quantity + 1, locked: true };
        else {
          next = { ...moved(base, existing, e.board), locked: true, addedBy: "user" };
          if (e.acquire !== undefined) next.acquire = next.state === "placed" ? null : e.acquire;
        }
        rows = rows.map((r, i) => (i === at ? next : r));
      } else {
        const id = pendingRowId(e.key);
        rows.push({ ...newRow(base, id, e.oracleId, e.name, e.board, ctx.details?.get(e.oracleId), ctx.owned, { acquire: e.acquire ?? null }), pendingKey: e.key });
      }
    }
  }
  return { ...base, cards: rows, ...totals(base, rows) };
}

/** Progress and cost to finish, as deckView() adds them up. */
function totals(v: Pick<LoadedDeck, "claiming" | "commanders" | "commanderSlots">, rows: readonly DeviceRow[]) {
  const main = rows.filter((c) => c.board === "main");
  const slots = [...v.commanderSlots, ...main];
  const inHand = (c: DeckRow) => c.state === "placed" || (!v.claiming && (c.state === "free" || c.state === "shared"));
  const placed = slots.filter(inHand).reduce((n, c) => n + c.quantity, 0);
  const total = v.commanders.length + main.reduce((n, c) => n + c.quantity, 0);
  const cost = slots.filter((c) => c.state === "not-owned").reduce((n, c) => n + (c.priceUsd ?? 0) * c.quantity, 0);
  return { progress: { placed, total, of: 100 }, costToFinish: Math.round(cost * 100) / 100 };
}

/** The numbers on the deck's tabs (the layout's): open slots in the 100, and suggestions. */
export function tabCounts(v: Pick<LoadedDeck, "cards" | "commanderSlots">): Record<string, number> {
  const missing = [...v.commanderSlots, ...v.cards.filter((c) => c.board === "main")].filter((c) => c.state !== "placed").length;
  const upgrades = v.cards.filter((c) => c.board === "upgrade" || c.board === "wanted").length;
  return { "/decks/[id]/missing": missing, "/decks/[id]/suggestions": upgrades };
}
