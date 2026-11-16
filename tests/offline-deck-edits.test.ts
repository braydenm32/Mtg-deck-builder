import { describe, expect, it } from "vitest";
import { describeEdit, editRequest, enqueue, inverseEdit, outcomeOf, rowOverlay, type DeckEdit, type RowSnapshot } from "@/lib/offline/deck-edits";

const card: RowSnapshot = { oracleId: "o-sol", name: "Sol Ring", board: "main", locked: false, acquire: null };
let n = 0;
const at = { at: 0, deckId: 7 };
const patch = (rowId: number, p: Extract<DeckEdit, { kind: "patch" }>["patch"], c: RowSnapshot = card): DeckEdit => ({ ...at, key: `k${n++}`, kind: "patch", rowId, card: c, patch: p });
const remove = (rowId: number): DeckEdit => ({ ...at, key: `k${n++}`, kind: "remove", rowId, card });
const add = (oracleId: string, board: "main" | "maybe" = "main"): DeckEdit => ({ ...at, key: `k${n++}`, kind: "add", oracleId, name: "Cultivate", board });

describe("deck edits kept on the device", () => {
  it("makes the same calls the page always made", () => {
    expect(editRequest(add("o-cult", "maybe"))).toEqual({ url: "/api/decks/7/cards", method: "POST", body: { oracleId: "o-cult", board: "maybe" } });
    expect(editRequest(patch(3, { locked: true }))).toEqual({ url: "/api/decks/7/cards/3", method: "PATCH", body: { locked: true } });
    expect(editRequest(remove(3))).toEqual({ url: "/api/decks/7/cards/3", method: "DELETE" });
    const removed = { id: 3, deckId: 7, oracleId: "o-sol", board: "main" };
    expect(editRequest({ ...at, key: "r", kind: "restore", removed, name: "Sol Ring" })).toEqual({ url: "/api/decks/7/cards/restore", method: "POST", body: { removed } });
  });

  it("waits when offline, the server is down or the app is locked, and drops what can never succeed", () => {
    expect(outcomeOf(remove(1), "network")).toBe("wait");
    expect(outcomeOf(remove(1), 503)).toBe("wait");
    expect(outcomeOf(remove(1), 401)).toBe("locked");
    expect(outcomeOf(remove(1), 200, true)).toBe("locked");
    expect(outcomeOf(add("x"), 201)).toBe("done");
    // Removing a row that's already gone did what was asked.
    expect(outcomeOf(remove(1), 404)).toBe("done");
    expect(outcomeOf(add("x"), 404)).toBe("failed");
    expect(outcomeOf(patch(1, { locked: true }), 400)).toBe("failed");
  });

  it("hides removed and moved rows, and added suggestions, until the page is redrawn", () => {
    const row = { id: 3, oracleId: "o-sol", board: "main" };
    expect(rowOverlay([], row)).toEqual({ hidden: false });
    expect(rowOverlay([remove(3)], row).hidden).toBe(true);
    expect(rowOverlay([remove(4)], row).hidden).toBe(false);
    expect(rowOverlay([patch(3, { board: "maybe" })], row).hidden).toBe(true);
    expect(rowOverlay([patch(3, { board: "maybe" }), patch(3, { board: "main" })], row).hidden).toBe(false);
    expect(rowOverlay([patch(3, { locked: true }), patch(3, { acquire: "proxy" })], row)).toEqual({ hidden: false, locked: true, acquire: "proxy" });
    // A suggestion that was added leaves the suggestions; the same card in the deck stays.
    expect(rowOverlay([add("o-sol")], { id: 9, oracleId: "o-sol", board: "upgrade" }).hidden).toBe(true);
    expect(rowOverlay([add("o-sol")], { id: 9, oracleId: "o-sol", board: "wanted" }).hidden).toBe(true);
    expect(rowOverlay([add("o-sol")], row).hidden).toBe(false);
  });

  it("names each edit", () => {
    expect(describeEdit(add("o", "main"))).toBe("Added Cultivate");
    expect(describeEdit(add("o", "maybe"))).toBe("Added Cultivate to the maybeboard");
    expect(describeEdit(remove(1))).toBe("Removed Sol Ring");
    expect(describeEdit(patch(1, { board: "maybe" }))).toBe("Moved Sol Ring to the maybeboard");
    expect(describeEdit(patch(1, { board: "main" }))).toBe("Moved Sol Ring into the deck");
    expect(describeEdit(patch(1, { locked: true }))).toBe("Locked Sol Ring");
    expect(describeEdit(patch(1, { locked: false }))).toBe("Unlocked Sol Ring");
    expect(describeEdit(patch(1, { acquire: "proxy" }))).toBe("Sol Ring: to proxy");
  });

  it("undoes a sent edit with the one that reverses it", () => {
    const moved = patch(3, { board: "maybe" });
    expect(inverseEdit(moved)).toMatchObject({ kind: "patch", rowId: 3, patch: { board: "main" }, card: { board: "maybe" } });
    expect(inverseEdit(patch(3, { acquire: "proxy" }))).toMatchObject({ patch: { acquire: null } });
    const removed = { id: 3, deckId: 7, oracleId: "o-sol", board: "main" };
    expect(inverseEdit(remove(3), { removed })).toMatchObject({ kind: "restore", removed, name: "Sol Ring" });
    // Without the row the server sent back, or for an added card, there's nothing to send.
    expect(inverseEdit(remove(3), { ok: true })).toBeUndefined();
    expect(inverseEdit(add("o"))).toBeUndefined();
  });

  it("folds repeated changes to a row into one, and drops a change that's been turned back", () => {
    let q: DeckEdit[] = [];
    q = enqueue(q, patch(3, { locked: true }));
    q = enqueue(q, patch(3, { acquire: "proxy" }, { ...card, locked: true }));
    expect(q.map((e) => e.kind === "patch" && e.patch)).toEqual([{ locked: true }, { acquire: "proxy" }]);
    // Unlocking again before it was sent: no call at all.
    q = enqueue(q, patch(3, { locked: false }, { ...card, locked: true, acquire: "proxy" }));
    expect(q.map((e) => e.kind === "patch" && e.patch)).toEqual([{ acquire: "proxy" }]);
    // Proxy, then buy: one call, for buy.
    q = enqueue(q, patch(3, { acquire: "buy" }, { ...card, acquire: "proxy" }));
    expect(q.map((e) => e.kind === "patch" && e.patch)).toEqual([{ acquire: "buy" }]);
    // Other rows and other kinds of edit queue as they are, in order.
    q = enqueue(q, remove(4));
    q = enqueue(q, patch(5, { board: "maybe" }));
    expect(q.map((e) => e.kind)).toEqual(["patch", "remove", "patch"]);
  });
});
