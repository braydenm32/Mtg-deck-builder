import Link from "next/link";
import { getDb } from "@/db/client";
import { DeckToast } from "@/components/deck/DeckRowActions";
import { PreconPicker } from "@/components/decks/PreconPicker";
import { knownLocations } from "@/lib/collection/locations";

export const dynamic = "force-dynamic";

/** Import an official Commander precon (under More in Decks), then upgrade it from your collection. */
export default async function PreconsPage() {
  const places = (await knownLocations(await getDb())).filter((p) => p.location);
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="old-look-only space-y-4">
        <Link href="/decks" className="inline-flex min-h-11 items-center text-sm text-muted hover:text-foreground">
          ← Decks
        </Link>
        <h1 className="text-2xl font-semibold">Import a precon</h1>
      </div>
      <p className="text-sm text-muted">
        Pick a Commander precon. If you own it, its cards go into your collection in their exact printings. Then the deck’s Upgrades tab finds swaps from the rest of your collection.
      </p>
      <PreconPicker places={places} />
      <DeckToast />
    </div>
  );
}
