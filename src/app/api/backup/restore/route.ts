import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { backupCounts, makeBackup, parseBackup, restoreBackup } from "@/lib/backup";
import { uploadedText } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/backup/restore[?confirm=1], body: the backup file (plain or gzipped).
 * Without confirm it only checks the file: { ok, backup: counts, current: counts }.
 * With confirm=1 it replaces the collection, decks, import history and settings: { ok, counts }.
 */
export async function POST(req: Request) {
  const parsed = parseBackup(await uploadedText(req).catch(() => ""));
  if (!parsed.ok) return NextResponse.json(parsed, { status: 400 });
  const db = await getDb();
  if (new URL(req.url).searchParams.get("confirm") !== "1") {
    const current = backupCounts(await makeBackup(db));
    return NextResponse.json({ ok: true, backup: parsed.counts, exportedAt: parsed.backup.exportedAt, current });
  }
  const res = await restoreBackup(db, parsed.backup);
  return NextResponse.json(res, { status: res.ok ? 200 : 422 });
}
