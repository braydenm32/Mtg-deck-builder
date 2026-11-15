import { getDb } from "@/db/client";
import { exportDeck } from "@/lib/deck/export";
import { getDeck } from "@/lib/deck/store";

export const runtime = "nodejs";

/** GET /api/decks/:id/export?format=text|missing|pull[&download=1] -> text/plain */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number.parseInt((await params).id, 10);
  const sp = new URL(req.url).searchParams;
  const format = (["text", "missing", "pull"] as const).find((f) => f === sp.get("format")) ?? "text";
  const v = Number.isFinite(id) ? await getDeck(await getDb(), id) : undefined;
  if (!v) return new Response("Not found", { status: 404 });
  const headers: Record<string, string> = { "Content-Type": "text/plain; charset=utf-8" };
  if (sp.get("download")) {
    const file = `${v.deck.name.replace(/[^\w -]+/g, "").trim() || "deck"}${format === "text" ? "" : `-${format}`}.txt`;
    headers["Content-Disposition"] = `attachment; filename="${file}"`;
  }
  return new Response(exportDeck(v, format), { headers });
}
