import { Skeleton } from "@/components/ui";

/** Today's shape while it loads: Needs you, then your decks and the collection line. No spinner, no jump. */
export default function Loading() {
  return (
    <div aria-busy="true" className="space-y-8 lg:grid lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:items-start lg:gap-8 lg:space-y-0">
      <span className="sr-only">Loading Today</span>
      <section className="space-y-3">
        <div className="flex min-h-11 items-center">
          <Skeleton className="h-7 w-28" />
        </div>
        <div className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-panel">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="flex min-h-16 items-center gap-3 p-3">
              <Skeleton className="h-8 w-11 rounded-lg" />
              <div className="min-w-0 flex-1 space-y-2">
                <Skeleton className="h-4 w-3/5" />
                <Skeleton className="h-3 w-4/5" />
              </div>
              <Skeleton className="h-11 w-20 rounded-lg" />
            </div>
          ))}
        </div>
      </section>
      <div className="space-y-4">
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <Skeleton className="h-7 w-32" />
            <Skeleton className="h-11 w-28 rounded-lg" />
          </div>
          <div className="space-y-2">
            {Array.from({ length: 3 }, (_, i) => (
              <div key={i} className="flex items-center gap-3 rounded-xl border border-line bg-panel p-3">
                <Skeleton className="aspect-[488/680] w-11 rounded-[4.5%]" />
                <div className="min-w-0 flex-1 space-y-2">
                  <Skeleton className="h-4 w-1/2" />
                  <Skeleton className="h-2 w-full rounded-full" />
                  <Skeleton className="h-3 w-24" />
                </div>
              </div>
            ))}
          </div>
        </section>
        <Skeleton className="h-4 w-56" />
      </div>
    </div>
  );
}
