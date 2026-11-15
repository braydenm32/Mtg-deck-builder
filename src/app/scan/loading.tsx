import { Skeleton } from "@/components/ui";

/** Scan: the camera box and the shutter, with this visit's list beside them on a laptop. */
export default function Loading() {
  return (
    <div className="grid gap-6 min-[900px]:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] min-[900px]:items-start" aria-busy="true">
      <span className="sr-only">Loading…</span>
      <div className="scan-stage flex flex-col gap-3">
        <Skeleton className="scan-view min-h-80 w-full rounded-2xl" />
        <div className="flex justify-center">
          <Skeleton className="h-[72px] w-[72px] rounded-full" />
        </div>
      </div>
      <div className="hidden space-y-2 min-[900px]:block">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-16 w-full rounded-xl" />
      </div>
    </div>
  );
}
