import { Suspense } from "react";
import type { Metadata } from "next";
import { PageContainer, PageHeader } from "@/components/dashboard/page-header";
import {
  AddProviderLink,
  ProviderList,
  ProvidersEmptyState,
} from "@/components/settings/providers/provider-list";
import { Skeleton } from "@/components/ui/skeleton";
import { listProviders } from "@/lib/email/provider-admin";
import { requireUser } from "@/lib/session";
import { requireActiveWorkspace } from "@/lib/workspace";

export const metadata: Metadata = { title: "Sending providers" };

export default function ProvidersPage() {
  return (
    <PageContainer>
      <PageHeader
        title="Sending providers"
        description="The email services Klyve uses to deliver your campaigns. You bring your own, so sending stays free."
      />
      {/* Providers depend on the logged-in user's workspace, so they stream in. */}
      <Suspense fallback={<ProvidersSkeleton />}>
        <ProvidersOverview />
      </Suspense>
    </PageContainer>
  );
}

async function ProvidersOverview() {
  // Access is checked right next to the data (see settings/page.tsx).
  const ws = await requireActiveWorkspace();
  const user = await requireUser();
  // listProviders only returns safe fields: never the encrypted credentials.
  const providers = await listProviders(ws.id);
  const canManage = ws.role === "OWNER" || ws.role === "ADMIN";

  if (providers.length === 0) return <ProvidersEmptyState canManage={canManage} />;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-zinc-500">
          {providers.length === 1 ? "1 provider" : `${providers.length} providers`}
        </p>
        {canManage && <AddProviderLink />}
      </div>
      <ProviderList providers={providers} userEmail={user.email} canManage={canManage} />
    </div>
  );
}

function ProvidersSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-hidden>
      <div className="flex items-center justify-between">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-8 w-32 rounded-lg" />
      </div>
      {[1, 2].map((n) => (
        <div key={n} className="flex flex-col gap-4 rounded-xl border bg-white p-5">
          <div className="flex items-center gap-3">
            <Skeleton className="size-6 rounded-md" />
            <div className="flex flex-1 flex-col gap-2">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-64 max-w-full" />
            </div>
            <Skeleton className="h-6 w-20 rounded-full" />
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[1, 2, 3, 4].map((m) => (
              <Skeleton key={m} className="h-9" />
            ))}
          </div>
          <Skeleton className="h-7 w-72 max-w-full" />
        </div>
      ))}
    </div>
  );
}
