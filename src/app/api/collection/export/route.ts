import { getDb } from "@/db/client";
import { COLLECTION_EXPORT_FORMATS, exportCollectionCsv, exportFileName } from "@/lib/collection/export";
import { downloadResponse } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/collection/export?format=tutor|moxfield|manabox -> the whole collection as a CSV download. */
export async function GET(req: Request) {
  const want = new URL(req.url).searchParams.get("format");
  const format = COLLECTION_EXPORT_FORMATS.find((f) => f === want) ?? "tutor";
  const csv = await exportCollectionCsv(await getDb(), format);
  return downloadResponse(csv, "text/csv; charset=utf-8", exportFileName(format === "tutor" ? "collection" : `collection-${format}`, "csv"));
}
