import type { Metadata } from "next";
import { Megaphone } from "lucide-react";
import { EmptyState } from "@/components/dashboard/empty-state";
import { PageContainer, PageHeader } from "@/components/dashboard/page-header";

export const metadata: Metadata = { title: "Campaigns" };

// Placeholder until this feature is built. It shows no private data, so it
// relies on the layout's <AuthGuard />. When real data is added here, load
// it in a component inside <Suspense> that calls requireActiveWorkspace().
export default function CampaignsPage() {
  return (
    <PageContainer>
      <PageHeader title="Campaigns" description="One-off emails sent to your lists." />
      <EmptyState
        icon={Megaphone}
        title="No campaigns yet"
        description="Write a one-off email, pick who gets it, send it now or schedule it, then see opens and clicks."
        phase={4}
      />
    </PageContainer>
  );
}
