import { eq, inArray } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db/client";
import { cards, collectionEvents, collectionItems, deckCards, deckSnapshots, decks, games, importBatches, packageCards, packages, priceAlerts, printings, unmatchedRows, wants } from "@/db/schema";
import { clearMatchCaches, matchIdentities } from "@/lib/cards/match";
import { getSettings, saveSettings, type AppSettings } from "@/lib/settings";

/**
 * A backup is everything that's yours and can't be downloaded again: the collection, the decks and
 * their cards, import history, price alerts and the settings. Card data (cards, printings, prices) isn't in it,
 * since Scryfall supplies that. Rows keep their IDs, so decks still point at the same copies after
 * a restore.
 */
export const BACKUP_FORMAT = "mtg-deck-tutor-backup";
export const BACKUP_VERSION = 1;

type Item = typeof collectionItems.$inferSelect;
type Deck = typeof decks.$inferSelect;
type DeckCard = typeof deckCards.$inferSelect;
type CustomCardRow = typeof cards.$inferSelect;
type Batch = typeof importBatches.$inferSelect;
type Miss = typeof unmatchedRows.$inferSelect;
type Want = typeof wants.$inferSelect;
type Game = typeof games.$inferSelect;
type Pack = typeof packages.$inferSelect;
type PackCard = typeof packageCards.$inferSelect;
type Event = typeof collectionEvents.$inferSelect;
type Alert = typeof priceAlerts.$inferSelect;

export type Backup = {
  format: typeof BACKUP_FORMAT;
  version: number;
  exportedAt: string;
  settings: AppSettings;
  collection: Item[];
  decks: Deck[];
  deckCards: DeckCard[];
  importBatches: Batch[];
  unmatchedRows: Miss[];
  /** Cards you added to the want list yourself (missing in backups made before it existed). */
  wants?: Want[];
  /** Games logged with the decks (added after the first backups, so optional). */
  games?: Game[];
  /** Card packages and their cards (optional for the same reason). */
  packages?: Pack[];
  packageCards?: PackCard[];
  /** The collection's activity log, sales included (optional for the same reason). */
  collectionEvents?: Event[];
  /** Cards you made up (optional for the same reason). */
  customCards?: CustomCardRow[];
  /** Price alerts (optional for the same reason). */
  priceAlerts?: Alert[];
};

export type BackupCounts = { stacks: number; copies: number; decks: number; deckCards: number; imports: number };

export function backupCounts(b: Pick<Backup, "collection" | "decks" | "deckCards" | "importBatches">): BackupCounts {
  return {
    stacks: b.collection.length,
    copies: b.collection.reduce((n, r) => n + r.quantity, 0),
    decks: b.decks.length,
    deckCards: b.deckCards.length,
    imports: b.importBatches.length,
  };
}

export async function makeBackup(db: Db, now = new Date()): Promise<Backup> {
  const [settings, collection, deckRows, cardRows, batches, misses, wantRows, gameRows, packRows, packCardRows, eventRows, customRows, alertRows] = await Promise.all([
    getSettings(db),
    db.select().from(collectionItems).orderBy(collectionItems.id),
    db.select().from(decks).orderBy(decks.id),
    db.select().from(deckCards).orderBy(deckCards.id),
    db.select().from(importBatches).orderBy(importBatches.id),
    db.select().from(unmatchedRows).orderBy(unmatchedRows.id),
    db.select().from(wants).orderBy(wants.oracleId),
    db.select().from(games).orderBy(games.id),
    db.select().from(packages).orderBy(packages.id),
    db.select().from(packageCards),
    db.select().from(collectionEvents).orderBy(collectionEvents.id),
    db.select().from(cards).where(eq(cards.custom, true)),
    db.select().from(priceAlerts).orderBy(priceAlerts.id),
  ]);
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: now.toISOString(),
    settings,
    collection,
    decks: deckRows,
    deckCards: cardRows,
    // An import's undo snapshot is a copy of the collection as it was: large, and meaningless once
    // restored, so it's left out (a restored import can't be undone).
    importBatches: batches.map((b) => ({ ...b, snapshot: null })),
    unmatchedRows: misses,
    wants: wantRows,
    games: gameRows,
    packages: packRows,
    packageCards: packCardRows,
    collectionEvents: eventRows,
    customCards: customRows,
    priceAlerts: alertRows,
  };
}

// Validation: the shape every row needs, extra fields passed through (and then dropped by the insert).
const id = z.number().int().positive();
const item = z.looseObject({
  id,
  printingId: z.string().min(1),
  oracleId: z.string().min(1),
  quantity: z.number().int().min(1),
  finish: z.string(),
  condition: z.string(),
  lang: z.string(),
  location: z.string(),
  source: z.string(),
  addedAt: z.string(),
});
const deck = z.looseObject({ id, name: z.string(), commanderOracleId: z.string(), status: z.string(), createdAt: z.string(), updatedAt: z.string() });
const deckCard = z.looseObject({ id, deckId: id, oracleId: z.string(), quantity: z.number().int().min(0) });
const batch = z.looseObject({ id, source: z.string(), createdAt: z.string() });
const want = z.looseObject({ oracleId: z.string().min(1), quantity: z.number().int().min(1), addedAt: z.string() });
const game = z.looseObject({ id, deckId: id, playedAt: z.string(), result: z.enum(["win", "loss", "draw"]), createdAt: z.string() });
const pack = z.looseObject({ id, name: z.string(), createdAt: z.string(), updatedAt: z.string() });
const packCard = z.looseObject({ packageId: id, oracleId: z.string().min(1) });
const event = z.looseObject({ id, at: z.string(), kind: z.enum(["add", "import", "remove", "count", "move", "sold"]), quantity: z.number().int() });
const alert = z.looseObject({ id, oracleId: z.string().min(1), printingId: z.string().min(1), direction: z.enum(["below", "above"]), usd: z.number().positive(), createdAt: z.string() });
const miss = z.looseObject({ id, batchId: id, rowNumber: z.number().int(), reason: z.string() });

const backupSchema = z.object({
  format: z.literal(BACKUP_FORMAT),
  version: z.number().int(),
  exportedAt: z.string(),
  settings: z.record(z.string(), z.unknown()).optional(),
  collection: z.array(item),
  decks: z.array(deck),
  deckCards: z.array(deckCard),
  importBatches: z.array(batch).default([]),
  unmatchedRows: z.array(miss).default([]),
  wants: z.array(want).default([]),
  games: z.array(game).default([]),
  packages: z.array(pack).default([]),
  packageCards: z.array(packCard).default([]),
  collectionEvents: z.array(event).default([]),
  customCards: z.array(z.looseObject({ oracleId: z.string().min(1), name: z.string().min(1), normName: z.string(), normFrontName: z.string(), typeLine: z.string(), updatedAt: z.string() })).default([]),
  priceAlerts: z.array(alert).default([]),
});

export type ParsedBackup = { ok: true; backup: Backup; counts: BackupCounts } | { ok: false; error: string };

/** Read a backup file's text. Says what's wrong in plain words when it isn't one. */
export function parseBackup(text: string): ParsedBackup {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, error: "That file isn’t a backup: it isn’t JSON." };
  }
  if ((json as { format?: unknown })?.format !== BACKUP_FORMAT) return { ok: false, error: "That file isn’t an MTG Deck Tutor backup." };
  if (Number((json as { version?: unknown }).version) > BACKUP_VERSION) {
    return { ok: false, error: "That backup was made by a newer version of the app. Update the app, then try again." };
  }
  const parsed = backupSchema.safeParse(json);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, error: `The backup is damaged (${issue.path.join(".") || "file"}: ${issue.message}).` };
  }
  const backup = parsed.data as unknown as Backup;
  const deckIds = new Set(backup.decks.map((d) => d.id));
  const orphan = backup.deckCards.find((c) => !deckIds.has(c.deckId));
  if (orphan) return { ok: false, error: `The backup is damaged: a deck card points at deck ${orphan.deckId}, which isn’t in it.` };
  return { ok: true, backup, counts: backupCounts(backup) };
}

export type RestoreResult = { ok: true; counts: BackupCounts } | { ok: false; error: string };

/**
 * Replace the collection, decks, import history and settings with a backup's. Printings the
 * card data doesn't have yet are fetched from Scryfall first; if any still can't be found, nothing
 * is changed. Runs in one transaction, so a failure leaves everything as it was.
 */
export async function restoreBackup(db: Db, backup: Backup, opts: { online?: boolean } = {}): Promise<RestoreResult> {
  const wanted = [...new Set(backup.collection.map((r) => r.printingId))];
  const known = new Set<string>();
  for (let i = 0; i < wanted.length; i += 500) {
    const rows = await db.select({ id: printings.id }).from(printings).where(inArray(printings.id, wanted.slice(i, i + 500)));
    for (const r of rows) known.add(r.id);
  }
  const missing = wanted.filter((p) => !known.has(p));
  if (missing.length) {
    const found = await matchIdentities(
      db,
      missing.map((scryfallId) => ({ scryfallId })),
      { online: opts.online },
    );
    const still = missing.filter((_, i) => !found[i].ok);
    if (still.length) {
      return {
        ok: false,
        error: `${still.length} printing${still.length === 1 ? "" : "s"} in the backup aren’t in the card data and couldn’t be fetched from Scryfall. Download the card data from Today first, then try again. Nothing was changed.`,
      };
    }
  }

  const chunk = <T>(rows: T[], size = 200) => Array.from({ length: Math.ceil(rows.length / size) }, (_, i) => rows.slice(i * size, i * size + size));
  await db.transaction(async (tx) => {
    await tx.delete(deckCards);
    await tx.delete(decks);
    await tx.delete(collectionItems);
    await tx.delete(unmatchedRows);
    await tx.delete(importBatches);
    await tx.delete(wants);
    await tx.delete(games);
    await tx.delete(packageCards);
    await tx.delete(packages);
    await tx.delete(collectionEvents);
    await tx.delete(priceAlerts);
    // Versions belong to the decks being replaced.
    await tx.delete(deckSnapshots);
    for (const rows of chunk(backup.importBatches)) await tx.insert(importBatches).values(rows.map((b) => ({ ...b, snapshot: null })));
    for (const rows of chunk(backup.unmatchedRows)) await tx.insert(unmatchedRows).values(rows);
    for (const rows of chunk(backup.collection)) await tx.insert(collectionItems).values(rows);
    for (const rows of chunk(backup.decks)) await tx.insert(decks).values(rows);
    for (const rows of chunk(backup.deckCards)) await tx.insert(deckCards).values(rows);
    for (const rows of chunk(backup.wants ?? [])) await tx.insert(wants).values(rows);
    for (const rows of chunk(backup.games ?? [])) await tx.insert(games).values(rows);
    for (const rows of chunk(backup.packages ?? [])) await tx.insert(packages).values(rows);
    for (const rows of chunk(backup.packageCards ?? [])) await tx.insert(packageCards).values(rows);
    for (const rows of chunk(backup.collectionEvents ?? [])) await tx.insert(collectionEvents).values(rows);
    for (const rows of chunk(backup.priceAlerts ?? [])) await tx.insert(priceAlerts).values(rows);
    // Your own cards are kept as they are here and added from the backup (a card can't be replaced while decks use it).
    for (const rows of chunk(backup.customCards ?? [])) await tx.insert(cards).values(rows.map((c) => ({ ...c, custom: true }))).onConflictDoNothing();
  });
  if (backup.settings) await saveSettings(db, backup.settings);
  clearMatchCaches(db);
  return { ok: true, counts: backupCounts(backup) };
}
