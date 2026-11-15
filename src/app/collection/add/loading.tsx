import { Skeleton } from "@/components/ui";

/** Type a name: the search box and a few results. Without this, Collection's own skeleton would show here. */
export default function Loading() {
  return (
    <div className="max-w-5xl space-y-4" aria-busy="true">
      <span className="sr-only">Loading…</span>
      <Skeleton className="h-12 w-full rounded-xl" />
      <div className="space-y-2">
        <Skeleton className="h-16 w-full rounded-xl" />
        <Skeleton className="h-16 w-full rounded-xl" />
        <Skeleton className="h-16 w-full rounded-xl" />
      </div>
    </div>
  );
}
