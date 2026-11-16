import { getDb } from "@/db/client";
import { makeBackup } from "@/lib/backup";
import { exportFileName } from "@/lib/collection/export";
import { downloadResponse } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/backup -> a gzipped JSON file (.json.gz) of the collection, decks, import history and settings. */
export async function GET() {
  const backup = await makeBackup(await getDb());
  return downloadResponse(JSON.stringify(backup), "application/json", exportFileName("backup", "json.gz"), { gzip: true });
}
