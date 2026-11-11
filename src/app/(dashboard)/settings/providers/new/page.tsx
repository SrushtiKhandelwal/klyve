import { Suspense } from "react";
import type { Metadata } from "next";
import { PageContainer, PageHeader } from "@/components/dashboard/page-header";
import { NewProviderWizard } from "@/components/settings/providers/new-provider-wizard";
import { Skeleton } from "@/components/ui/skeleton";
import { requireActiveWorkspace } from "@/lib/workspace";
import { BackToProviders, ManagersOnlyNotice } from "../back-link";

export const metadata: Metadata = { title: "Add a sending provider" };

export default function NewProviderPage() {
  return (
    <PageContainer>
      <BackToProviders />
      <PageHeader
        title="Add a sending provider"
        description="Connect the email service your campaigns will be sent through. We test the connection as soon as you save."
      />
      {/* The role check reads the session, so it streams in. */}
      <Suspense fallback={<WizardSkeleton />}>
        <NewProviderContent />
      </Suspense>
    </PageContainer>
  );
}

async function NewProviderContent() {
  const ws = await requireActiveWorkspace();
  if (ws.role !== "OWNER" && ws.role !== "ADMIN") return <ManagersOnlyNotice action="add sending providers" />;

  // The "Local test server (Mailpit)" preset is for development only.
  return <NewProviderWizard showDevPresets={process.env.NODE_ENV !== "production"} />;
}

function WizardSkeleton() {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-hidden>
      {[1, 2, 3, 4, 5, 6].map((n) => (
        <Skeleton key={n} className="h-36 rounded-xl" />
      ))}
    </div>
  );
}
