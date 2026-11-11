import type { Metadata } from "next";
import { Users } from "lucide-react";
import { EmptyState } from "@/components/dashboard/empty-state";
import { PageContainer, PageHeader } from "@/components/dashboard/page-header";

export const metadata: Metadata = { title: "Contacts" };

// Placeholder until this feature is built. It shows no private data, so it
// relies on the layout's <AuthGuard />. When real data is added here, load
// it in a component inside <Suspense> that calls requireActiveWorkspace().
export default function ContactsPage() {
  return (
    <PageContainer>
      <PageHeader title="Contacts" description="Everyone you can send email to." />
      <EmptyState
        icon={Users}
        title="No contacts yet"
        description="Import, organise and segment the people you email, with lists, tags and unsubscribe tracking."
        phase={1}
      />
    </PageContainer>
  );
}
