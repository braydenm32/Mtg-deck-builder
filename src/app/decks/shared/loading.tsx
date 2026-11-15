import { Skeleton } from "@/components/ui";

/** Shared cards while it loads: the summary, then a few card rows. */
export default function Loading() {
  return (
    <div className="space-y-4 lg:grid lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start lg:gap-8 lg:space-y-0" aria-busy="true">
      <span className="sr-only">Loading shared cards</span>
      <div className="space-y-2 lg:col-start-2 lg:row-start-1 lg:rounded-2xl lg:border lg:border-line lg:bg-panel lg:p-5">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
      </div>
      <div className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-panel lg:col-start-1 lg:row-start-1">
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="space-y-3 p-3 sm:p-4">
            <div className="flex items-center gap-3">
              <Skeleton className="aspect-[488/680] w-10 shrink-0 rounded-[4.5%]" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-2/5" />
                <Skeleton className="h-3 w-1/3" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Skeleton className="h-16 rounded-lg" />
              <Skeleton className="h-16 rounded-lg" />
            </div>
            <div className="flex gap-2">
              <Skeleton className="h-11 w-44 rounded-lg" />
              <Skeleton className="h-11 w-44 rounded-lg" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
