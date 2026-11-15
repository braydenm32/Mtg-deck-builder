import { Skeleton } from "@/components/ui";

/** Both looks' skeletons; CSS shows the one that matches (the new one only inside the app shell). */
export default function Loading() {
  return (
    <>
      <div className="hidden space-y-3 in-[.app-shell]:block" aria-busy aria-label="Loading your cards">
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
      <div className="old-look-only space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-10 w-full" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {Array.from({ length: 12 }, (_, i) => (
            <Skeleton key={i} className="aspect-[488/680] rounded-[4.5%]" />
          ))}
        </div>
      </div>
    </>
  );
}
