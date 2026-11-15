import { Skeleton } from "@/components/ui";

/** New deck while it loads: the three steps, with the commander search first. */
export default function Loading() {
  return (
    <div className="mx-auto max-w-2xl space-y-6" aria-busy="true">
      <span className="sr-only">Loading the new deck form</span>
      <Skeleton className="h-4 w-4/5" />
      <section className="space-y-3">
        <Skeleton className="h-7 w-36" />
        <Skeleton className="h-12 w-full rounded-xl" />
        <div className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-panel">
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="flex min-h-14 items-center gap-3 px-3 py-1.5">
              <Skeleton className="aspect-[488/680] w-8 shrink-0 rounded-[4.5%]" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          ))}
        </div>
      </section>
      <Skeleton className="h-7 w-28" />
      <Skeleton className="h-7 w-24" />
    </div>
  );
}
