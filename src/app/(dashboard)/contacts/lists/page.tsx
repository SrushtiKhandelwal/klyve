import { Suspense } from "react";
import type { Metadata } from "next";
import { PageContainer, PageHeader } from "@/components/dashboard/page-header";
import { CreateListButton } from "@/components/contacts/lists/list-form-dialog";
import { ListsEmptyState, ListsGrid } from "@/components/contacts/lists/lists-grid";
import { Skeleton } from "@/components/ui/skeleton";
import { getListsWithCounts } from "@/lib/contacts/lists";
import { requireActiveWorkspace } from "@/lib/workspace";

export const metadata: Metadata = { title: "Lists" };

export default function ListsPage() {
  return (
    <PageContainer>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <PageHeader
          title="Lists"
          description="Group your contacts so you can send each campaign to the right people."
        />
        {/* The button shows no private data, so it renders instantly. */}
        <CreateListButton className="self-start sm:self-auto" />
      </div>

      {/* The lists depend on the logged-in user's workspace, so they stream in. */}
      <Suspense fallback={<ListsSkeleton />}>
        <ListsOverview />
      </Suspense>
    </PageContainer>
  );
}

async function ListsOverview() {
  // Checks access right next to the data (see settings/page.tsx).
  const ws = await requireActiveWorkspace();
  const lists = await getListsWithCounts(ws.id);

  if (lists.length === 0) return <ListsEmptyState />;
  return <ListsGrid lists={lists} />;
}

function ListsSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-hidden>
      {[1, 2, 3].map((n) => (
        <div key={n} className="flex flex-col gap-4 rounded-xl border bg-white p-5">
          <div className="flex items-center gap-3">
            <Skeleton className="size-5 rounded-md" />
            <div className="flex flex-1 flex-col gap-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-44" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Skeleton className="h-14 rounded-lg" />
            <Skeleton className="h-14 rounded-lg" />
          </div>
          <Skeleton className="h-3 w-24" />
        </div>
      ))}
    </div>
  );
}
