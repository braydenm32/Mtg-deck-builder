import { ImportDeckForm } from "@/components/ImportDeckForm";

/** Import a decklist (under More in Decks): paste, check the preview, import, see the result. */
export default function ImportDeckPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <p className="text-sm text-muted">
        Paste a list from Moxfield, Archidekt, MTGO, Arena or any “1 Card Name” list. It’s checked against your collection: cards you own count toward the deck, and the rest show as missing.
      </p>
      <ImportDeckForm />
    </div>
  );
}
