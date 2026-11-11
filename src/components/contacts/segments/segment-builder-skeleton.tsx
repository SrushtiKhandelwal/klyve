import { Skeleton } from "@/components/ui/skeleton";

/** Placeholder shown while the rule builder's data loads. */
export function SegmentBuilderSkeleton() {
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
      <div className="flex flex-col gap-6">
        <div className="rounded-xl border bg-white p-5">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="mt-2 h-8 w-full" />
        </div>
        <div className="rounded-xl border bg-white">
          <div className="border-b px-5 py-4">
            <Skeleton className="h-6 w-64" />
          </div>
          <div className="flex flex-col gap-2 p-4">
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </div>
        </div>
      </div>
      <div className="rounded-xl border bg-white p-5">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="mt-4 h-8 w-24" />
      </div>
    </div>
  );
}
