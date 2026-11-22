import { Skeleton } from "@/components/ui";

/** The card page's skeleton. */
export default function Loading() {
  return (
    <div className="pt-4" aria-busy aria-label="Loading the card">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,300px)_minmax(0,1fr)] lg:gap-10">
        <Skeleton className="hidden aspect-[488/680] w-full rounded-[4.5%] lg:block" />
        <div className="space-y-6">
          <div className="flex gap-3">
            <Skeleton className="aspect-[488/680] w-16 rounded-[4.5%] lg:hidden" />
            <div className="flex-1 space-y-2 pt-1">
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-4 w-1/3" />
            </div>
          </div>
          <Skeleton className="h-[76px] w-full rounded-2xl" />
          <Skeleton className="h-6 w-1/2" />
          <Skeleton className="h-28 w-full rounded-2xl" />
        </div>
      </div>
    </div>
  );
}
