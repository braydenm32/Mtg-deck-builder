import { Skeleton } from "@/components/ui";

/** Find a commander while it loads (EDHREC can take a second): the theme menu, then two lists of commanders. */
export default function Loading() {
  return (
    <div className="space-y-5" aria-busy="true">
      <span className="sr-only">Finding commanders</span>
      <Skeleton className="h-12 w-full max-w-xl rounded-xl" />
      <div className="space-y-6 lg:grid lg:grid-cols-2 lg:items-start lg:gap-6 lg:space-y-0">
        {Array.from({ length: 2 }, (_, s) => (
          <section key={s} className="space-y-3">
            <Skeleton className="h-6 w-40" />
            <div className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-panel">
              {Array.from({ length: 5 }, (_, i) => (
                <div key={i} className="flex min-h-[68px] items-center gap-3 px-3 py-2">
                  <Skeleton className="aspect-[488/680] w-10 shrink-0 rounded-[4.5%]" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-1/2" />
                    <div className="flex gap-1.5">
                      <Skeleton className="h-4 w-14" />
                      <Skeleton className="h-4 w-3/5" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
