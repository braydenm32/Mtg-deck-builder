import Link from "next/link";
import { ImportDeckForm } from "@/components/ImportDeckForm";

export default function ImportDeckPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Link href="/decks" className="inline-flex min-h-11 items-center text-sm text-muted hover:text-foreground">
        ← Decks
      </Link>
      <h1 className="text-2xl font-semibold">Import a decklist</h1>
      <p className="text-sm text-muted">
        Paste a list exported from Moxfield, Archidekt, MTGO, Arena or any “1 Card Name” list. Every card is locked, so rebuilding keeps your list;
        the cards you own are placed from your collection, and the rest show as missing.
      </p>
      <ImportDeckForm />
    </div>
  );
}
