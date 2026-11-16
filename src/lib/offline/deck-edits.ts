/**
 * Deck edits as data, so they can be kept on the device and sent later (src/lib/offline/outbox.ts).
 * Pure: what each edit asks the server, how it changes the rows a page shows until the page is
 * redrawn, what it says in a list, and what undoes it. See docs/speed.md, stage 3.
 */

export type Board = "main" | "maybe";
export type Acquire = "buy" | "proxy" | null;

/** What a deck row looked like when it was edited: enough to name it, show it, and undo the edit. */
export type RowSnapshot = { oracleId: string; name: string; board: string; locked: boolean; acquire: Acquire };

export type RowPatch = { locked?: boolean; board?: Board; acquire?: Acquire };

/** A removed deck_cards row as the server returned it, for putting it back. */
export type RemovedRow = { id: number; deckId: number; oracleId: string; board: string } & Record<string, unknown>;

type Base = { key: string; at: number; deckId: number };
export type DeckEdit =
  | (Base & { kind: "add"; oracleId: string; name: string; board: Board; acquire?: Acquire })
  | (Base & { kind: "patch"; rowId: number; card: RowSnapshot; patch: RowPatch })
  | (Base & { kind: "remove"; rowId: number; card: RowSnapshot })
  | (Base & { kind: "restore"; removed: RemovedRow; name: string });

/** Spread-safe "omit key/at": what a caller passes to queue an edit. */
export type NewDeckEdit = DeckEdit extends infer E ? (E extends DeckEdit ? Omit<E, "key" | "at"> : never) : never;

/** The API call that carries out an edit (the same calls the page always made). */
export function editRequest(e: DeckEdit): { url: string; method: string; body?: unknown } {
  const base = `/api/decks/${e.deckId}/cards`;
  switch (e.kind) {
    case "add":
      return { url: base, method: "POST", body: { oracleId: e.oracleId, board: e.board, ...(e.acquire !== undefined ? { acquire: e.acquire } : {}) } };
    case "patch":
      return { url: `${base}/${e.rowId}`, method: "PATCH", body: e.patch };
    case "remove":
      return { url: `${base}/${e.rowId}`, method: "DELETE" };
    case "restore":
      return { url: `${base}/restore`, method: "POST", body: { removed: e.removed } };
  }
}

/**
 * What to do with an answer: done (drop it from the queue), wait (keep it and stop sending until
 * later: offline, the server is down, or the app is locked), or failed (it can never succeed).
 */
export type Outcome = "done" | "wait" | "locked" | "failed";
export function outcomeOf(e: DeckEdit, status: number | "network", redirected = false): Outcome {
  if (status === "network" || status >= 500 || status === 408 || status === 429) return "wait";
  if (status === 401 || status === 403 || redirected) return "locked";
  if (status >= 200 && status < 300) return "done";
  // Removing a card that's already gone did what was asked.
  if (status === 404 && e.kind === "remove") return "done";
  return "failed";
}

/** A row as edits leave it: its board, lock and buy/proxy, or hidden when removed. */
export type RowOverlay = { hidden: boolean; board?: string; locked?: boolean; acquire?: Acquire };

/**
 * How unsent edits change the rows already on the page. A removed row, or one moved to the other
 * board, is hidden (it's listed with the edits waiting to send); a suggestion that was added is
 * hidden from the suggestions too.
 */
export function rowOverlay(edits: DeckEdit[], row: { id: number; oracleId: string; board: string }): RowOverlay {
  const out: RowOverlay = { hidden: false };
  for (const e of edits) {
    if (e.kind === "remove" && e.rowId === row.id) out.hidden = true;
    else if (e.kind === "patch" && e.rowId === row.id) {
      if (e.patch.board !== undefined) out.board = e.patch.board;
      if (e.patch.locked !== undefined) out.locked = e.patch.locked;
      if (e.patch.acquire !== undefined) out.acquire = e.patch.acquire;
    } else if (e.kind === "add" && e.oracleId === row.oracleId && (row.board === "upgrade" || row.board === "wanted")) out.hidden = true;
  }
  if (out.board !== undefined && out.board !== row.board) out.hidden = true;
  return out;
}

/** "Added Sol Ring", "Moved Cultivate to the maybeboard", "Locked Arcane Signet". */
export function describeEdit(e: DeckEdit): string {
  switch (e.kind) {
    case "add":
      return e.board === "maybe" ? `Added ${e.name} to the maybeboard` : `Added ${e.name}`;
    case "remove":
      return `Removed ${e.card.name}`;
    case "restore":
      return `Put ${e.name} back`;
    case "patch": {
      const { board, locked, acquire } = e.patch;
      if (board !== undefined) return board === "maybe" ? `Moved ${e.card.name} to the maybeboard` : `Moved ${e.card.name} into the deck`;
      if (locked !== undefined) return locked ? `Locked ${e.card.name}` : `Unlocked ${e.card.name}`;
      if (acquire !== undefined) return acquire === "proxy" ? `${e.card.name}: to proxy` : `${e.card.name}: to buy`;
      return `Changed ${e.card.name}`;
    }
  }
}

/**
 * The edit that undoes one the server already has, or undefined when there's none: an added card
 * has no row id until the page is redrawn (remove it from its row instead), and a removal needs the
 * row the server sent back.
 */
export function inverseEdit(e: DeckEdit, answer?: unknown): NewDeckEdit | undefined {
  if (e.kind === "patch") {
    const back: RowPatch = {};
    if (e.patch.board !== undefined) back.board = e.card.board === "maybe" ? "maybe" : "main";
    if (e.patch.locked !== undefined) back.locked = e.card.locked;
    if (e.patch.acquire !== undefined) back.acquire = e.card.acquire;
    const card = { ...e.card, ...e.patch } as RowSnapshot;
    return { kind: "patch", deckId: e.deckId, rowId: e.rowId, card, patch: back };
  }
  if (e.kind === "remove") {
    const removed = (answer as { removed?: RemovedRow } | undefined)?.removed;
    return removed ? { kind: "restore", deckId: e.deckId, removed, name: e.card.name } : undefined;
  }
  return undefined;
}

/**
 * Add `next` to the queue, folding it into an unsent edit where one cancels or replaces another:
 * changing the same thing on a row twice keeps the last value, and a lock that's turned back
 * before it was sent disappears.
 */
export function enqueue(queue: DeckEdit[], next: DeckEdit): DeckEdit[] {
  if (next.kind !== "patch") return [...queue, next];
  const fields = Object.keys(next.patch) as (keyof RowPatch)[];
  const out: DeckEdit[] = [];
  const patch: RowPatch = { ...next.patch };
  for (const e of queue) {
    if (e.kind === "patch" && e.rowId === next.rowId && e.deckId === next.deckId) {
      const keep: RowPatch = { ...e.patch };
      for (const f of fields) delete keep[f];
      if (Object.keys(keep).length) out.push({ ...e, patch: keep });
    } else out.push(e);
  }
  // A field set back to what the row had before any unsent edit needs no call.
  for (const f of fields) if (patch[f] === original(queue, next, f)) delete patch[f];
  return Object.keys(patch).length ? [...out, { ...next, patch }] : out;
}

/** The value a row had before the unsent edits to `field` (from the oldest one's snapshot). */
function original(queue: DeckEdit[], next: Extract<DeckEdit, { kind: "patch" }>, field: keyof RowPatch) {
  const first = queue.find((e): e is Extract<DeckEdit, { kind: "patch" }> => e.kind === "patch" && e.rowId === next.rowId && e.deckId === next.deckId && field in e.patch);
  return (first ?? next).card[field];
}
