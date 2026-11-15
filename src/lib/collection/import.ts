import { desc, eq, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { collectionItems, importBatches, unmatchedRows } from "@/db/schema";
import { parseCollectionCsv, SOURCE_LABELS, type CsvSource } from "@/lib/ingest/csv";
import { looksLikeCsv, parseCardList } from "@/lib/ingest/text";
import type { CardEntry } from "@/lib/cards/identity";
import { addCards } from "./service";

export type ImportMode =
  /** Add to what's already there. */
  | "add"
  /** Replace cards that came from earlier imports of the same app (keeps scanned and manual cards). */
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
  /** Copies currently in the collection from earlier imports of this source (what "replace" would remove). */
  existingFromSource: number;
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
  };
}

export async function importCollection(db: Db, input: ImportInput): Promise<ImportSummary> {
  const mode = input.mode ?? "add";
  const { source, sourceLabel, rows, skipped, errors } = parseInput(input);

  const [batch] = await db
    .insert(importBatches)
    .values({ source, filename: input.filename ?? null, createdAt: new Date().toISOString(), mode, rowCount: rows.length })
    .returning({ id: importBatches.id });

  if (mode === "replace-source" && rows.length) {
    await db.delete(collectionItems).where(eq(collectionItems.source, source));
  }

  const result = await addCards(
    db,
    rows.map((r) => r.entry),
    { source, batchId: batch.id },
    { online: input.online },
  );

  if (result.unmatched.length) {
    const values = result.unmatched.map((u) => {
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

  const copies = result.added.reduce((n, a) => n + rows[a.index].entry.quantity, 0);
  await db
    .update(importBatches)
    .set({ matchedCount: result.added.length, unmatchedCount: result.unmatched.length })
    .where(eq(importBatches.id, batch.id));

  return {
    batchId: batch.id,
    source,
    sourceLabel,
    rows: rows.length,
    matched: result.added.length,
    unmatched: result.unmatched.length,
    skipped,
    copies,
    errors,
  };
}

export async function getBatch(db: Db, id: number) {
  const [batch] = await db.select().from(importBatches).where(eq(importBatches.id, id));
  if (!batch) return undefined;
  const misses = await db.select().from(unmatchedRows).where(eq(unmatchedRows.batchId, id)).orderBy(unmatchedRows.rowNumber);
  return { batch, misses };
}

export async function recentBatches(db: Db, limit = 10) {
  return db.select().from(importBatches).orderBy(desc(importBatches.id)).limit(limit);
}

export function sourceLabel(source: string): string {
  if (source === "text") return "Card list";
  if (source.startsWith("csv:")) return SOURCE_LABELS[source.slice(4) as CsvSource] ?? source;
  return source.charAt(0).toUpperCase() + source.slice(1);
}
