import { Skeleton } from "@/components/ui";

export default function Loading() {
  return (
    <div className="space-y-2" aria-busy="true">
      {Array.from({ length: 10 }, (_, i) => (
        <Skeleton key={i} className="h-12" />
      ))}
    </div>
  );
}
