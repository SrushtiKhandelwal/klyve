import { Suspense } from "react";
import type { Metadata } from "next";
import { ImportWizard } from "@/components/contacts/import/import-wizard";
import { RecentImports, RecentImportsSkeleton } from "@/components/contacts/import/recent-imports";
import { PageContainer, PageHeader } from "@/components/dashboard/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { getAttributeDefinitions, getListOptions } from "@/lib/contacts/lookups";
import { requireActiveWorkspace } from "@/lib/workspace";

export const metadata: Metadata = { title: "Import contacts" };

export default function ImportContactsPage() {
  return (
    <PageContainer>
      <PageHeader
        title="Import contacts"
        description="Upload a CSV file from Excel, Google Sheets or another email tool."
      />

      {/* The wizard needs the workspace's lists and fields, which depend on
          who is logged in, so it streams in. */}
      <Suspense fallback={<WizardSkeleton />}>
        <WizardLoader />
      </Suspense>

      <section aria-labelledby="recent-imports-heading" className="rounded-xl border bg-white">
        <div className="border-b px-5 py-4">
          <h2 id="recent-imports-heading" className="font-semibold text-zinc-900">
            Recent imports
          </h2>
        </div>
        <Suspense fallback={<RecentImportsSkeleton />}>
          <RecentImports />
        </Suspense>
      </section>
    </PageContainer>
  );
}

async function WizardLoader() {
  const ws = await requireActiveWorkspace();
  const [lists, attributes] = await Promise.all([
    getListOptions(ws.id),
    getAttributeDefinitions(ws.id),
  ]);
  return (
    <ImportWizard
      lists={lists}
      attributes={attributes.map((a) => ({ key: a.key, label: a.label, type: a.type }))}
    />
  );
}

function WizardSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex gap-2">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-7 flex-1 rounded-full" />
        ))}
      </div>
      <Skeleton className="h-56 w-full rounded-xl" />
    </div>
  );
}
