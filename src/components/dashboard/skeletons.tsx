import { Skeleton } from "@/components/ui/skeleton";

// Grey placeholder shapes shown while user/workspace data streams in.
// They match the size of the real thing so nothing jumps when it loads.

export function WorkspaceSwitcherSkeleton() {
  return (
    <div className="flex h-12 items-center gap-2.5 rounded-lg border px-2 md:max-lg:justify-center md:max-lg:border-transparent md:max-lg:px-0">
      <Skeleton className="size-8 shrink-0 rounded-md" />
      <div className="flex flex-1 flex-col gap-1.5 md:max-lg:hidden">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-2.5 w-14" />
      </div>
    </div>
  );
}

export function UserMenuSkeleton() {
  return (
    <div className="flex h-12 items-center gap-2.5 px-2 md:max-lg:justify-center md:max-lg:px-0">
      <Skeleton className="size-8 shrink-0 rounded-full" />
      <div className="flex flex-1 flex-col gap-1.5 md:max-lg:hidden">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-2.5 w-32" />
      </div>
    </div>
  );
}
