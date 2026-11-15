import { Skeleton } from "@/components/ui";

/**
 * My decks while it loads: the quiet line and its button, then deck tiles.
 * It sits in the (list) route group so it never shows for the pages inside one deck.
 */
export default function Loading() {
  return (
    <div className="space-y-6" aria-busy="true">
      <span className="sr-only">Loading your decks</span>
      <div className="flex items-center justify-between gap-3">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-11 w-28 rounded-lg" />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="flex gap-3 rounded-xl border border-line bg-panel p-3">
            <Skeleton className="aspect-[488/680] w-14 shrink-0 rounded-[4.5%]" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-4 w-3/5" />
              <Skeleton className="h-3 w-4/5" />
              <Skeleton className="h-2 w-full rounded-full" />
              <Skeleton className="h-3 w-2/5" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
