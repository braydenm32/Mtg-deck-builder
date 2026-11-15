import { Skeleton } from "@/components/ui";

export default function Loading() {
  return (
    <div className="space-y-6" aria-busy="true">
      <Skeleton className="h-8 w-40" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-28" />
        ))}
      </div>
    </div>
  );
}
