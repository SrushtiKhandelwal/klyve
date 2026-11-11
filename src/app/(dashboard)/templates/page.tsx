import type { Metadata } from "next";
import { FileText } from "lucide-react";
import { EmptyState } from "@/components/dashboard/empty-state";
import { PageContainer, PageHeader } from "@/components/dashboard/page-header";

export const metadata: Metadata = { title: "Templates" };

// Placeholder until this feature is built. It shows no private data, so it
// relies on the layout's <AuthGuard />. When real data is added here, load
// it in a component inside <Suspense> that calls requireActiveWorkspace().
export default function TemplatesPage() {
  return (
    <PageContainer>
      <PageHeader title="Templates" description="Reusable email designs." />
      <EmptyState
        icon={FileText}
        title="No templates yet"
        description="Design reusable email layouts with your branding, so every campaign looks consistent."
        phase={3}
      />
    </PageContainer>
  );
}
