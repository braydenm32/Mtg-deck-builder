import { Skeleton } from "@/components/ui";

/** Import a file: the file picker, and recent imports beside it. In the (file) group, so /import/[id] has its own. */
export default function Loading() {
  return (
    <div className="grid gap-6 min-[900px]:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] min-[900px]:items-start" aria-busy="true">
      <span className="sr-only">Loading…</span>
      <div className="space-y-4">
        <Skeleton className="h-64 w-full rounded-2xl" />
        <Skeleton className="h-12 w-full rounded-xl" />
      </div>
      <div className="space-y-2">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-14 w-full rounded-xl" />
        <Skeleton className="h-14 w-full rounded-xl" />
      </div>
    </div>
  );
}
