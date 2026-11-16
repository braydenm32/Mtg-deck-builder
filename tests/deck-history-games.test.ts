import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import { makeBackup, parseBackup, restoreBackup } from "@/lib/backup";
import { storeScryfallCards } from "@/lib/cards/store";
import { deckRecords, deleteGame, listGames, logGame, recordOf, restoreGame } from "@/lib/deck/games";
import { diffRows, listVersions, recordVersion, restoreVersion, rowsHash, snapshotRows } from "@/lib/deck/history";
import { addDeckCard, createDeck, deleteDeck, getDeck, placeCopies, removeDeckCard } from "@/lib/deck/store";
import type { ScryfallCard } from "@/lib/scryfall/client";
import { tempDb } from "./helpers";

let n = 0;
function fake(name: string, type = "Artifact", ci = ""): ScryfallCard {
  n += 1;
  const hex = n.toString(16).padStart(12, "0");
  return {
    object: "card",
    id: `40000000-0000-4000-8000-${hex}`,
    oracle_id: `41111111-0000-4000-8000-${hex}`,
    name,
    lang: "en",
    released_at: "2024-01-01",
    layout: "normal",
    mana_cost: "{1}",
    cmc: 1,
    type_line: type,
    oracle_text: "",
    colors: [...ci],
    color_identity: [...ci],
    keywords: [],
    legalities: { commander: "legal" },
    games: ["paper"],
    set: "tst",
    set_name: "Test Set",
    set_type: "expansion",
    collector_number: String(n),
    rarity: "rare",
    finishes: ["nonfoil"],
    prices: { usd: "1.00" },
    image_uris: { small: "s.jpg", normal: "n.jpg" },
  } as unknown as ScryfallCard;
}

const LEADER = fake("Test Leader", "Legendary Creature — Human", "W");
const A = fake("Card A");
const B = fake("Card B");
const C = fake("Card C");

let db: Db;
let cleanup: () => void;
let deckId: number;
beforeEach(async () => {
  ({ db, cleanup } = await tempDb());
  await storeScryfallCards(db, [LEADER, A, B, C]);
  deckId = (await createDeck(db, { commanderOracleId: LEADER.oracle_id!, name: "Test deck", status: "idea" })).id;
  await addDeckCard(db, deckId, A.oracle_id!);
  await addDeckCard(db, deckId, B.oracle_id!);
});
afterEach(() => cleanup());

const t = (min: number) => new Date(Date.UTC(2026, 10, 16, 9, min));
const mainNames = async () => (await getDeck(db, deckId))!.cards.filter((c) => c.board === "main").map((c) => c.name).sort();

describe("deck history", () => {
  it("keeps a version only when the deck changed, folding changes within the hour but never the first", async () => {
    const first = await recordVersion(db, deckId, "changes", { now: t(0) });
    expect(await recordVersion(db, deckId, "changes", { now: t(5) })).toBe(first); // unchanged
    await addDeckCard(db, deckId, C.oracle_id!);
    const second = await recordVersion(db, deckId, "changes", { now: t(10) });
    expect(second).not.toBe(first); // the first version is never folded away
    const row = (await getDeck(db, deckId))!.cards.find((c) => c.name === "Card A")!;
    await removeDeckCard(db, deckId, row.id);
    expect(await recordVersion(db, deckId, "changes", { now: t(20) })).toBe(second); // folded within the hour

    const versions = await listVersions(db, deckId, rowsHash(snapshotRows((await getDeck(db, deckId))!.cards)));
    expect(versions).toHaveLength(2);
    expect(versions[0]).toMatchObject({ current: true, cards: 2, added: [{ name: "Card C", quantity: 1 }], removed: [{ name: "Card A", quantity: 1 }] });
    expect(versions[1]).toMatchObject({ current: false, cards: 2 });
  });

  it("restores a version, keeping the deck as it was so the restore can be undone", async () => {
    const first = (await recordVersion(db, deckId, "changes", { now: t(0) }))!;
    await addDeckCard(db, deckId, C.oracle_id!);
    await addDeckCard(db, deckId, C.oracle_id!, { board: "maybe" });
    const before = await restoreVersion(db, deckId, first, placeCopies);
    expect(await mainNames()).toEqual(["Card A", "Card B"]);
    // Undo: the version kept before the restore.
    await restoreVersion(db, deckId, before!, placeCopies);
    expect(await mainNames()).toEqual(["Card A", "Card B"]);
    const v = (await getDeck(db, deckId))!;
    expect(v.cards.find((c) => c.name === "Card C")?.board).toBe("maybe");
    expect(v.commanders.map((c) => c.name)).toEqual(["Test Leader"]);
  });

  it("diffs the main deck by count", () => {
    const row = (oracleId: string, quantity: number, board = "main") => ({ oracleId, name: oracleId, quantity, board, role: "other", acquire: null, locked: false, addedBy: "user", reason: "", roles: null, tags: null });
    expect(diffRows([row("x", 1), row("y", 2)], [row("y", 1), row("z", 1), row("w", 1, "maybe")])).toEqual({
      added: [{ name: "z", quantity: 1 }],
      removed: [
        { name: "x", quantity: 1 },
        { name: "y", quantity: 1 },
      ],
    });
  });

  it("forgets a deleted deck's versions and games", async () => {
    await recordVersion(db, deckId);
    await logGame(db, deckId, { playedAt: "2026-11-15", result: "win", players: 4, notes: "" });
    await deleteDeck(db, deckId);
    expect(await listVersions(db, deckId)).toEqual([]);
    expect(await listGames(db)).toEqual([]);
  });
});

describe("game log", () => {
  it("logs games, adds up a record against an even share, and undoes a removal", async () => {
    await logGame(db, deckId, { playedAt: "2026-11-10", result: "win", players: 4, notes: "" });
    await logGame(db, deckId, { playedAt: "2026-11-12", result: "loss", players: 4, turns: 11, notes: "Mill" });
    const g = await logGame(db, deckId, { playedAt: "2026-11-14", result: "draw", players: 2, notes: "" });
    const list = await listGames(db, { deckId });
    expect(list.map((x) => x.playedAt)).toEqual(["2026-11-14", "2026-11-12", "2026-11-10"]);
    const r = recordOf(list);
    expect(r).toMatchObject({ played: 3, wins: 1, losses: 1, draws: 1, recent: ["draw", "loss", "win"] });
    expect(r.winRate).toBeCloseTo(1 / 3);
    expect(r.fairShare).toBeCloseTo((0.25 + 0.25 + 0.5) / 3);

    const removed = (await deleteGame(db, g.id))!;
    expect((await deckRecords(db))[0]).toMatchObject({ name: "Test deck", record: { played: 2 } });
    await restoreGame(db, removed);
    expect(await listGames(db, { deckId })).toHaveLength(3);
  });

  it("comes through a backup", async () => {
    await logGame(db, deckId, { playedAt: "2026-11-10", result: "win", players: 4, notes: "" });
    const parsed = parseBackup(JSON.stringify(await makeBackup(db)));
    if (!parsed.ok) throw new Error(parsed.error);
    await logGame(db, deckId, { playedAt: "2026-11-11", result: "loss", players: 4, notes: "" });
    await restoreBackup(db, parsed.backup);
    expect((await listGames(db)).map((x) => x.result)).toEqual(["win"]);
  });
});
