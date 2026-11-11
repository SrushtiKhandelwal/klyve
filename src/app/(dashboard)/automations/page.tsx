import type { Metadata } from "next";
import { Workflow } from "lucide-react";
import { EmptyState } from "@/components/dashboard/empty-state";
import { PageContainer, PageHeader } from "@/components/dashboard/page-header";

export const metadata: Metadata = { title: "Automations" };

// Placeholder until this feature is built. It shows no private data, so it
// relies on the layout's <AuthGuard />. When real data is added here, load
// it in a component inside <Suspense> that calls requireActiveWorkspace().
export default function AutomationsPage() {
  return (
    <PageContainer>
      <PageHeader title="Automations" description="Emails that send themselves." />
      <EmptyState
        icon={Workflow}
        title="No automations yet"
        description="Send emails automatically when something happens, like a welcome series for new subscribers."
        phase={8}
      />
    </PageContainer>
  );
}
