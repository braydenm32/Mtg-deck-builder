/*
 * Skeletons for the deck tabs (loading.tsx), shaped like each tab so nothing jumps when the data
 * arrives. They use the theme's skeleton token, so they suit both looks.
 */

/** Like Skeleton in ui.tsx, but taking its own corner radius (default rounded-md). */
function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse bg-skeleton ${/\brounded-/.test(className) ? "" : "rounded-md"} ${className}`} />;
}

function Rows({ n }: { n: number }) {
  return (
    <div className="space-y-px overflow-hidden rounded-xl">
      {Array.from({ length: n }, (_, i) => (
        <Skeleton key={i} className="h-14 rounded-none" />
      ))}
    </div>
  );
}

/** Overview: the summary strip, then two columns of panels. */
export function OverviewSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading the deck">
      <Skeleton className="h-64 rounded-2xl min-[900px]:h-60" />
      <div className="grid gap-4 min-[900px]:grid-cols-2">
        <div className="space-y-4">
          <Skeleton className="h-40 rounded-2xl" />
          <Skeleton className="h-64 rounded-2xl" />
        </div>
        <div className="space-y-4">
          <Skeleton className="h-52 rounded-2xl" />
          <Skeleton className="h-48 rounded-2xl" />
        </div>
      </div>
    </div>
  );
}

/** Cards: the add box, the grouping chips, then rows. */
export function CardsSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading the cards">
      <Skeleton className="h-11" />
      <div className="flex gap-2">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-11 w-20 rounded-full" />
        ))}
      </div>
      <Skeleton className="h-5 w-32" />
      <Rows n={10} />
    </div>
  );
}

/** Missing and Upgrades: a heading, a line of help, then rows; twice. */
export function ListSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading">
      {[5, 8].map((n, i) => (
        <div key={i} className="space-y-2">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-4 w-72 max-w-full" />
          <Rows n={n} />
        </div>
      ))}
    </div>
  );
}

/** Playtest: the hand of seven, then the numbers. */
export function PlaytestSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Shuffling">
      <div className="space-y-4 rounded-2xl border border-line p-4">
        <Skeleton className="h-6 w-40" />
        <div className="grid grid-cols-4 gap-2 min-[600px]:grid-cols-7">
          {Array.from({ length: 7 }, (_, i) => (
            <Skeleton key={i} className="aspect-[488/680] rounded-[4.5%]" />
          ))}
        </div>
      </div>
      <Skeleton className="h-56 rounded-2xl" />
    </div>
  );
}
