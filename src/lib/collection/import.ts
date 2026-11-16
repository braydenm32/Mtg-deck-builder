import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { collectionItems, importBatches, unmatchedRows } from "@/db/schema";
import { parseCollectionCsv, SOURCE_LABELS, type CsvSource } from "@/lib/ingest/csv";
import { looksLikeCsv, parseCardList } from "@/lib/ingest/text";
import type { CardEntry } from "@/lib/cards/identity";
import { addCards, resolveEntries, syncSource, type SyncDiff } from "./service";

export type ImportMode =
  /** Add to what's already there. */
  | "add"
  /**
   * Make the cards from this app match the file: new stacks added, gone ones removed, quantities
   * updated. Cards from other apps, the scanner, or added by hand aren't touched.
   * ("replace-source" is the old name.)
   */
  | "update"
  | "replace-source";

export type ImportInput = {
  text: string;
  filename?: string;
  mode?: ImportMode;
  /** Override auto-detection. */
  source?: CsvSource | "text";
  online?: boolean;
};

export type ImportSummary = {
  batchId: number;
  source: string;
  sourceLabel: string;
  rows: number;
  matched: number;
  unmatched: number;
  skipped: number;
  copies: number;
  errors: string[];
  diff?: SyncDiff;
};

/** What an import did, stored on its batch so the review page can show it later on any device. */
export type ImportResult = {
  rows: number;
  matched: number;
  unmatched: number;
  skipped: number;
  /** Copies in the matched rows. */
  copies: number;
  /** Matched rows whose printing the file named exactly, and ones where it was a guess. */
  exact: number;
  guessed: number;
  /** For Update: stacks added, changed, removed and unchanged, and the source's copies before and after. */
  diff?: SyncDiff;
  errors: string[];
};

type Parsed = {
  source: string;
  sourceLabel: string;
  rows: { rowNumber: number; entry: CardEntry; raw: Record<string, string> }[];
  skipped: number;
  errors: string[];
};

function parseInput(input: Pick<ImportInput, "text" | "source">): Parsed {
  const isCsv = input.source ? input.source !== "text" : looksLikeCsv(input.text);
  if (isCsv) {
    const parsed = parseCollectionCsv(input.text, input.source && input.source !== "text" ? input.source : undefined);
    return {
      source: `csv:${parsed.source}`,
      sourceLabel: SOURCE_LABELS[parsed.source],
      rows: parsed.rows,
      skipped: parsed.skipped.length,
      errors: parsed.errors,
    };
  }
  const parsed = parseCardList(input.text);
  return {
    source: "text",
    sourceLabel: "Card list",
    rows: parsed.rows.map((r) => ({ rowNumber: r.lineNumber, entry: r.entry, raw: { line: r.raw } })),
    skipped: parsed.skipped.length,
    errors: parsed.skipped.slice(0, 5).map((s) => `Line ${s.lineNumber}: couldn't read "${s.raw.trim()}"`),
  };
}

export type ImportPreview = {
  source: string;
  sourceLabel: string;
  rows: number;
  copies: number;
  skipped: number;
  errors: string[];
  sample: { rowNumber: number; quantity: number; name?: string; set?: string; number?: string; finish: string; lang?: string }[];
  /** Copies currently in the collection from earlier imports of this source. */
  existingFromSource: number;
  /** What "update" would change (only computed when there's an earlier import of this source). */
  diff?: SyncDiff;
  /** The mode the form should start on: "update" when this app was imported before. */
  suggestedMode: "add" | "update";
  /** Mythic Tools container types/names in the file, e.g. [{ type: "list", name: "bulk", copies: 115 }]. */
  containers: { type: string; name: string; copies: number }[];
};

/** Parse without writing anything, so the user can check the file before importing. */
export async function previewImport(db: Db, input: Pick<ImportInput, "text" | "source">): Promise<ImportPreview> {
  const p = parseInput(input);
  const [existing] = await db
    .select({ n: sql<number>`COALESCE(SUM(${collectionItems.quantity}), 0)` })
    .from(collectionItems)
    .where(eq(collectionItems.source, p.source));
  return {
    source: p.source,
    sourceLabel: p.sourceLabel,
    rows: p.rows.length,
    copies: p.rows.reduce((n, r) => n + r.entry.quantity, 0),
    skipped: p.skipped,
    errors: p.errors,
    sample: p.rows.slice(0, 8).map((r) => ({
      rowNumber: r.rowNumber,
      quantity: r.entry.quantity,
      name: r.entry.identity.name,
      set: r.entry.identity.setCode ?? r.entry.identity.setName,
      number: r.entry.identity.collectorNumber,
      finish: r.entry.finish,
      lang: r.entry.identity.lang,
    })),
    existingFromSource: Number(existing?.n ?? 0),
    diff: Number(existing?.n ?? 0) > 0 ? await dryRunUpdate(db, p) : undefined,
    suggestedMode: Number(existing?.n ?? 0) > 0 ? "update" : "add",
    containers: containersOf(p),
  };
}

function containersOf(p: Parsed): ImportPreview["containers"] {
  const m = new Map<string, { type: string; name: string; copies: number }>();
  for (const r of p.rows) {
    const type = r.raw["Container Type"]?.trim();
    const name = r.raw["Container Name"]?.trim();
    if (!type && !name) continue;
    const k = `${type}|${name}`;
    const c = m.get(k) ?? { type: type ?? "", name: name ?? "", copies: 0 };
    c.copies += r.entry.quantity;
    m.set(k, c);
  }
  return [...m.values()].sort((a, b) => b.copies - a.copies);
}

async function dryRunUpdate(db: Db, p: Parsed): Promise<SyncDiff> {
  const { resolved } = await resolveEntries(
    db,
    p.rows.map((r) => r.entry),
    { online: false },
  );
  return syncSource(db, p.source, resolved.map((r) => r.stack), { source: p.source }, { dryRun: true });
}

export async function importCollection(db: Db, input: ImportInput): Promise<ImportSummary> {
  const mode = input.mode === "replace-source" ? "update" : (input.mode ?? "add");
  const { source, sourceLabel, rows, skipped, errors } = parseInput(input);

  // Snapshot this source's stacks first, so the import can be undone.
  const before = await db.select().from(collectionItems).where(eq(collectionItems.source, source));
  const [batch] = await db
    .insert(importBatches)
    .values({ source, filename: input.filename ?? null, createdAt: new Date().toISOString(), mode, rowCount: rows.length, snapshot: before })
    .returning({ id: importBatches.id });

  const ctx = { source, batchId: batch.id };
  let matchedIdx: number[];
  let guessedCount = 0;
  let unmatched: { index: number; reason: string }[];
  let diff: SyncDiff | undefined;
  if (mode === "update") {
    const r = await resolveEntries(
      db,
      rows.map((x) => x.entry),
      { online: input.online },
    );
    diff = await syncSource(db, source, r.resolved.map((x) => x.stack), ctx);
    matchedIdx = r.resolved.map((x) => x.index);
    guessedCount = r.resolved.filter((x) => x.stack.printingConfidence === "guessed").length;
    unmatched = r.unmatched;
  } else {
    const r = await addCards(
      db,
      rows.map((x) => x.entry),
      ctx,
      { online: input.online },
    );
    matchedIdx = r.added.map((a) => a.index);
    guessedCount = r.added.filter((a) => a.confidence === "guessed").length;
    unmatched = r.unmatched;
  }

  if (unmatched.length) {
    const values = unmatched.map((u) => {
      const r = rows[u.index];
      return {
        batchId: batch.id,
        rowNumber: r.rowNumber,
        name: r.entry.identity.name ?? null,
        setCode: r.entry.identity.setCode ?? r.entry.identity.setName ?? null,
        collectorNumber: r.entry.identity.collectorNumber ?? null,
        quantity: r.entry.quantity,
        reason: u.reason,
        raw: r.raw,
      };
    });
    for (let i = 0; i < values.length; i += 200) await db.insert(unmatchedRows).values(values.slice(i, i + 200));
  }

  const copies = matchedIdx.reduce((n, i) => n + rows[i].entry.quantity, 0);
  const result: ImportResult = {
    rows: rows.length,
    matched: matchedIdx.length,
    unmatched: unmatched.length,
    skipped,
    copies,
    exact: matchedIdx.length - guessedCount,
    guessed: guessedCount,
    diff,
    errors,
  };
  await db
    .update(importBatches)
    .set({ matchedCount: matchedIdx.length, unmatchedCount: unmatched.length, result })
    .where(eq(importBatches.id, batch.id));

  return {
    batchId: batch.id,
    source,
    sourceLabel,
    rows: rows.length,
    matched: matchedIdx.length,
    unmatched: unmatched.length,
    skipped,
    copies,
    errors,
    diff,
  };
}

/** Can this import still be undone? Only the latest import of its source, and only once. */
export async function canUndo(db: Db, batchId: number): Promise<boolean> {
  const [b] = await db.select().from(importBatches).where(eq(importBatches.id, batchId));
  if (!b || b.undoneAt || !b.snapshot) return false;
  const [latest] = await db
    .select({ id: importBatches.id })
    .from(importBatches)
    .where(and(eq(importBatches.source, b.source), isNull(importBatches.undoneAt)))
    .orderBy(desc(importBatches.id))
    .limit(1);
  return latest?.id === b.id;
}

/**
 * Undo an import: put this source's stacks back exactly as they were before it (same IDs,
 * so deck links survive). Cards from other sources are never touched.
 */
export async function undoImport(db: Db, batchId: number): Promise<boolean> {
  if (!(await canUndo(db, batchId))) return false;
  const [b] = await db.select().from(importBatches).where(eq(importBatches.id, batchId));
  const snapshot = (b.snapshot ?? []) as (typeof collectionItems.$inferSelect)[];
  await db.transaction(async (tx) => {
    await tx.delete(collectionItems).where(eq(collectionItems.source, b.source));
    for (let i = 0; i < snapshot.length; i += 200) await tx.insert(collectionItems).values(snapshot.slice(i, i + 200));
    await tx.update(importBatches).set({ undoneAt: new Date().toISOString() }).where(eq(importBatches.id, batchId));
  });
  return true;
}

/** A batch, what it did (`result`, null for imports made before results were kept) and its unmatched rows. */
export async function getBatch(db: Db, id: number) {
  const [batch] = await db.select().from(importBatches).where(eq(importBatches.id, id));
  if (!batch) return undefined;
  const misses = await db.select().from(unmatchedRows).where(eq(unmatchedRows.batchId, id)).orderBy(unmatchedRows.rowNumber);
  return { batch, result: (batch.result as ImportResult | null) ?? null, misses, open: misses.filter((m) => !m.resolvedAt).length };
}

export type MissResolution = "added" | "not-owned";

/** Mark an unmatched row as dealt with (or open again with null). Returns the row, or undefined if it isn't there. */
export async function resolveMiss(db: Db, batchId: number, rowId: number, resolution: MissResolution | null) {
  const [row] = await db
    .update(unmatchedRows)
    .set({ resolution, resolvedAt: resolution ? new Date().toISOString() : null })
    .where(and(eq(unmatchedRows.id, rowId), eq(unmatchedRows.batchId, batchId)))
    .returning();
  return row;
}

/** Unmatched rows not marked done yet, per batch. Batches with none are left out. */
export async function openMissCounts(db: Db, batchIds: number[]): Promise<Map<number, number>> {
  if (!batchIds.length) return new Map();
  const rows = await db
    .select({ batchId: unmatchedRows.batchId, n: sql<number>`COUNT(*)` })
    .from(unmatchedRows)
    .where(and(inArray(unmatchedRows.batchId, batchIds), isNull(unmatchedRows.resolvedAt)))
    .groupBy(unmatchedRows.batchId);
  return new Map(rows.map((r) => [r.batchId, Number(r.n)]));
}

export async function recentBatches(db: Db, limit = 10) {
  return db.select().from(importBatches).orderBy(desc(importBatches.id)).limit(limit);
}

export function sourceLabel(source: string): string {
  if (source === "text") return "Card list";
  if (source.startsWith("csv:")) return SOURCE_LABELS[source.slice(4) as CsvSource] ?? source;
  return source.charAt(0).toUpperCase() + source.slice(1);
}
