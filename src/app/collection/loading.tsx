import { Skeleton } from "@/components/ui";

/** The Collection page's skeleton: the search, the summary line and a page of rows. */
export default function Loading() {
  return (
    <div className="space-y-3" aria-busy aria-label="Loading your cards">
      <div className="flex gap-2">
        <Skeleton className="h-12 flex-1 rounded-xl" />
        <Skeleton className="h-12 w-12 rounded-xl md:w-28" />
      </div>
      <div className="flex h-11 items-center justify-between">
        <Skeleton className="h-4 w-56" />
        <Skeleton className="h-4 w-16" />
      </div>
      <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-panel">
        {Array.from({ length: 8 }, (_, i) => (
          <li key={i} className="flex min-h-[68px] items-center gap-3 px-3 py-2 md:px-4">
            <Skeleton className="h-[50px] w-9 shrink-0 rounded-[3px]" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-2/5" />
              <Skeleton className="h-3 w-1/3" />
            </div>
            <Skeleton className="h-4 w-14" />
          </li>
        ))}
      </ul>
    </div>
  );
}
