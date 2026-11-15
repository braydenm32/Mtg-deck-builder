import Link from "next/link";
import { ImportDeckForm } from "@/components/ImportDeckForm";

/** Import a decklist (under More in Decks): paste, check the preview, import, see the result. */
export default function ImportDeckPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="old-look-only space-y-4">
        <Link href="/decks" className="inline-flex min-h-11 items-center text-sm text-muted hover:text-foreground">
          ← Decks
        </Link>
        <h1 className="text-2xl font-semibold">Import a decklist</h1>
      </div>
      <p className="text-sm text-muted">
        Paste a list from Moxfield, Archidekt, MTGO, Arena or any “1 Card Name” list. It’s checked against your collection: cards you own count toward the deck, and the rest show as missing.
      </p>
      <ImportDeckForm />
    </div>
  );
}
