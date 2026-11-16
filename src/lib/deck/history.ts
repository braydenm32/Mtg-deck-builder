import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { cards, deckCards, deckSnapshots, decks, type SnapshotRow } from "@/db/schema";

/**
 * Deck history: the main deck and Maybe list as they were, so any version can be put back.
 *
 * A version is kept when the deck is opened after it changed (several changes within the hour
 * become one version, but the version before them stays), and always before a rebuild or a restore.
 * Restoring keeps the deck as it was first, so a restore can be undone the same way.
 */

const BOARDS = ["main", "maybe"];
const COALESCE_MS = 60 * 60 * 1000;
/** Versions kept per deck, newest first. */
const KEEP = 60;

export type Reason = "changes" | "before-rebuild" | "before-restore";

type RowLike = {
  oracleId: string;
  name: string;
  quantity: number;
  board: string;
  role: string;
  acquire: string | null;
  locked: boolean;
  addedBy: string;
  reason: string;
  roles?: string[] | null;
  roleOverride?: readonly string[] | null;
  tags?: string[] | null;
};

/** The rows worth keeping, in a stable order. */
export function snapshotRows(rows: readonly RowLike[]): SnapshotRow[] {
  return rows
    .filter((r) => BOARDS.includes(r.board))
    .map((r) => ({
      oracleId: r.oracleId,
      name: r.name,
      quantity: r.quantity,
      board: r.board,
      role: r.role,
      acquire: r.acquire,
      locked: r.locked,
      addedBy: r.addedBy,
      reason: r.reason,
      roles: r.roles !== undefined ? r.roles : r.roleOverride ? [...r.roleOverride] : null,
      tags: r.tags?.length ? [...r.tags] : null,
    }))
    .sort((a, b) => a.board.localeCompare(b.board) || a.oracleId.localeCompare(b.oracleId));
}

/** What identifies a version: the cards, counts, boards and buy/proxy marks. */
export function rowsHash(rows: readonly SnapshotRow[]): string {
  const s = rows.map((r) => `${r.board}:${r.oracleId}:${r.quantity}:${r.acquire ?? ""}`).join("|");
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return `${(h >>> 0).toString(36)}-${rows.length}`;
}

async function currentRows(db: Db, deckId: number): Promise<SnapshotRow[]> {
  const rows = await db
    .select({ dc: deckCards, name: cards.name })
    .from(deckCards)
    .leftJoin(cards, eq(cards.oracleId, deckCards.oracleId))
    .where(and(eq(deckCards.deckId, deckId), inArray(deckCards.board, BOARDS)));
  return snapshotRows(rows.map(({ dc, name }) => ({ ...dc, name: name ?? dc.oracleId, roles: dc.roles ?? null })));
}

/**
 * Keep the deck's current version if it changed since the last one. Pass `rows` when the caller
 * already has them (the deck page does); otherwise they're read. Returns the version's id.
 */
export async function recordVersion(db: Db, deckId: number, reason: Reason = "changes", opts: { rows?: readonly RowLike[]; now?: Date } = {}): Promise<number | undefined> {
  const now = opts.now ?? new Date();
  const rows = opts.rows ? snapshotRows(opts.rows) : await currentRows(db, deckId);
  const hash = rowsHash(rows);
  const [latest, previous] = await db
    .select({ id: deckSnapshots.id, at: deckSnapshots.at, reason: deckSnapshots.reason, hash: deckSnapshots.hash })
    .from(deckSnapshots)
    .where(eq(deckSnapshots.deckId, deckId))
    .orderBy(desc(deckSnapshots.at), desc(deckSnapshots.id))
    .limit(2);
  if (latest?.hash === hash) {
    // Same cards: a rebuild or restore only marks the version it starts from.
    if (reason !== "changes" && latest.reason === "changes") await db.update(deckSnapshots).set({ reason }).where(eq(deckSnapshots.id, latest.id));
    return latest.id;
  }
  // Changes within the hour fold into the latest version, as long as the one before them is kept.
  if (reason === "changes" && latest?.reason === "changes" && previous && now.getTime() - Date.parse(latest.at) < COALESCE_MS) {
    await db.update(deckSnapshots).set({ rows, hash, at: now.toISOString() }).where(eq(deckSnapshots.id, latest.id));
    return latest.id;
  }
  const [row] = await db.insert(deckSnapshots).values({ deckId, at: now.toISOString(), reason, hash, rows }).returning({ id: deckSnapshots.id });
  // Keep the newest KEEP versions.
  await db.run(sql`
    DELETE FROM deck_snapshots WHERE deck_id = ${deckId} AND id NOT IN (
      SELECT id FROM deck_snapshots WHERE deck_id = ${deckId} ORDER BY at DESC, id DESC LIMIT ${KEEP})`);
  return row.id;
}

export type Version = {
  id: number;
  at: string;
  reason: Reason;
  /** Cards in the main deck at that point. */
  cards: number;
  /** Changes to the main deck since the version before (quantity and name). */
  added: { name: string; quantity: number }[];
  removed: { name: string; quantity: number }[];
  /** True for the version that matches the deck now. */
  current: boolean;
};

function mainCounts(rows: readonly SnapshotRow[]) {
  const m = new Map<string, { name: string; quantity: number }>();
  for (const r of rows) {
    if (r.board !== "main") continue;
    const cur = m.get(r.oracleId);
    m.set(r.oracleId, { name: r.name, quantity: (cur?.quantity ?? 0) + r.quantity });
  }
  return m;
}

/** What changed in the main deck from `before` to `after`. */
export function diffRows(before: readonly SnapshotRow[], after: readonly SnapshotRow[]) {
  const a = mainCounts(before);
  const b = mainCounts(after);
  const added: Version["added"] = [];
  const removed: Version["removed"] = [];
  for (const [id, x] of b) {
    const d = x.quantity - (a.get(id)?.quantity ?? 0);
    if (d > 0) added.push({ name: x.name, quantity: d });
  }
  for (const [id, x] of a) {
    const d = x.quantity - (b.get(id)?.quantity ?? 0);
    if (d > 0) removed.push({ name: x.name, quantity: d });
  }
  const byName = (p: { name: string }, q: { name: string }) => p.name.localeCompare(q.name);
  return { added: added.sort(byName), removed: removed.sort(byName) };
}

/** The deck's versions, newest first, each with what changed since the one before. */
export async function listVersions(db: Db, deckId: number, currentHash?: string): Promise<Version[]> {
  const rows = await db.select().from(deckSnapshots).where(eq(deckSnapshots.deckId, deckId)).orderBy(deckSnapshots.at, deckSnapshots.id);
  const out: Version[] = rows.map((s, i) => ({
    id: s.id,
    at: s.at,
    reason: s.reason as Reason,
    cards: s.rows.filter((r) => r.board === "main").reduce((n, r) => n + r.quantity, 0),
    ...(i > 0 ? diffRows(rows[i - 1].rows, s.rows) : { added: [], removed: [] }),
    current: false,
  }));
  out.reverse();
  // Only the newest version matching the deck is "now" (a restore repeats an older one).
  const now = out.find((v, i) => rows[rows.length - 1 - i].hash === currentHash);
  if (now) now.current = true;
  return out;
}

/**
 * Put a version back: the main deck and Maybe list become what they were (the commander and the
 * builder's suggestions stay). The deck as it was is kept first; its id is returned for Undo.
 */
export async function restoreVersion(db: Db, deckId: number, versionId: number, placeCopies: (db: Db, deckId: number) => Promise<unknown>): Promise<number | undefined> {
  const [snap] = await db.select().from(deckSnapshots).where(and(eq(deckSnapshots.id, versionId), eq(deckSnapshots.deckId, deckId)));
  if (!snap) return undefined;
  const before = await recordVersion(db, deckId, "before-restore");
  const known = new Set(
    (snap.rows.length ? await db.select({ id: cards.oracleId }).from(cards).where(inArray(cards.oracleId, [...new Set(snap.rows.map((r) => r.oracleId))])) : []).map((r) => r.id),
  );
  const rows = snap.rows.filter((r) => known.has(r.oracleId));
  const ids = rows.map((r) => r.oracleId);
  await db.batch([
    db.delete(deckCards).where(and(eq(deckCards.deckId, deckId), inArray(deckCards.board, BOARDS))),
    ...(rows.length
      ? [
          // A card the version has on the main deck isn't also a suggestion.
          db.delete(deckCards).where(and(eq(deckCards.deckId, deckId), inArray(deckCards.board, ["upgrade", "wanted"]), inArray(deckCards.oracleId, ids))),
          db.insert(deckCards).values(
            rows.map((r) => ({
              deckId,
              oracleId: r.oracleId,
              quantity: r.quantity,
              board: r.board,
              role: r.role,
              acquire: r.acquire,
              locked: r.locked,
              addedBy: r.addedBy,
              reason: r.reason,
              roles: r.roles,
              tags: r.tags,
            })),
          ),
        ]
      : []),
    db.update(decks).set({ updatedAt: new Date().toISOString() }).where(eq(decks.id, deckId)),
  ]);
  await placeCopies(db, deckId);
  // The restored version is now the deck: mark it current by keeping it as a fresh version.
  await recordVersion(db, deckId, "changes");
  return before;
}

/** Forget a deleted deck's history. */
export async function deleteHistory(db: Db, deckIds: number[]) {
  if (deckIds.length) await db.delete(deckSnapshots).where(inArray(deckSnapshots.deckId, deckIds));
}

