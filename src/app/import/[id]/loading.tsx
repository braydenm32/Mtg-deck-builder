import { Skeleton } from "@/components/ui";

/** Import review: the summary strip, then the rows that need you. */
export default function Loading() {
  return (
    <div className="space-y-6" aria-busy="true">
      <span className="sr-only">Loading the import…</span>
      <div className="max-w-3xl space-y-4 rounded-2xl border border-line bg-panel p-4 sm:p-5">
        <Skeleton className="h-9 w-56" />
        <div className="flex gap-2">
          <Skeleton className="h-7 w-44" />
          <Skeleton className="h-7 w-32" />
        </div>
        <Skeleton className="h-4 w-full max-w-sm" />
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-12 w-48" />
      </div>
      <div className="max-w-3xl space-y-2">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="h-24 w-full rounded-xl" />
      </div>
    </div>
  );
}
