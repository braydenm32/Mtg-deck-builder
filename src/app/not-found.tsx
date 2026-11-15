import Link from "next/link";
import { Panel } from "@/components/ui";

/** A missing card, deck or import. In the new look the top bar already names the page, so the heading is old-look only. */
export default function NotFound() {
  return (
    <Panel className="max-w-xl space-y-3 p-5">
      <h1 className="old-look-only text-xl font-semibold">Not found</h1>
      <p className="font-medium">This page doesn&apos;t exist, or what it showed has been removed.</p>
      <p className="text-sm text-muted">A card page goes when its last copy leaves your collection, and a deck page goes when the deck is deleted.</p>
      <div className="flex flex-wrap gap-2 pt-1">
        <Link href="/" className="inline-flex min-h-11 items-center rounded-lg border border-line px-4 text-sm font-medium hover:bg-panel">
          Go to Today
        </Link>
        <Link href="/collection" className="inline-flex min-h-11 items-center rounded-lg border border-line px-4 text-sm font-medium hover:bg-panel">
          Search your collection
        </Link>
      </div>
    </Panel>
  );
}
