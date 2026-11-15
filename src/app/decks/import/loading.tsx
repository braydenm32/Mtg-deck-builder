import { Skeleton } from "@/components/ui";

/** Import a decklist: the paste box. Without this, the deck skeleton in src/app/decks/loading.tsx would show. */
export default function Loading() {
  return (
    <div className="mx-auto max-w-2xl space-y-4" aria-busy="true">
      <span className="sr-only">Loading…</span>
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-56 w-full rounded-xl" />
      <Skeleton className="h-12 w-40 rounded-xl" />
    </div>
  );
}
