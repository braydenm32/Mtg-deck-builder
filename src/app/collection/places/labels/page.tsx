import { headers } from "next/headers";
import { getDb } from "@/db/client";
import { BoxLabels } from "@/components/collection/BoxLabels";
import { DeckToast } from "@/components/deck/DeckRowActions";
import { placesSummary } from "@/lib/collection/places";

export const dynamic = "force-dynamic";

/** Labels and NFC tags for boxes and binders: each one's link opens the collection on what's inside. */
export default async function BoxLabelsPage() {
  const [{ places }, h] = await Promise.all([placesSummary(await getDb()), headers()]);
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const boxes = places.map((p) => ({ location: p.location, copies: p.copies, url: `${proto}://${host}/collection?loc=${encodeURIComponent(p.location)}` }));
  return (
    <div className="max-w-2xl space-y-3">
      <h1 className="old-look-only text-2xl font-semibold">Box labels</h1>
      <p className="px-1 text-sm text-muted">Stick a label or an NFC tag on each box or binder. Tapping the tag (or opening the link) shows what&rsquo;s inside.</p>
      {boxes.length ? <BoxLabels boxes={boxes} /> : <p className="px-1 text-sm text-muted">No boxes or binders yet.</p>}
      <DeckToast />
    </div>
  );
}
