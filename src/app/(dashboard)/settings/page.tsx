import { Suspense, type ReactNode } from "react";
import type { Metadata } from "next";
import { Server } from "lucide-react";
import { EmptyState } from "@/components/dashboard/empty-state";
import { PageContainer, PageHeader } from "@/components/dashboard/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { requireActiveWorkspace } from "@/lib/workspace";

export const metadata: Metadata = { title: "Settings" };

const ROLE_LABELS = { OWNER: "Owner", ADMIN: "Admin", MEMBER: "Member" } as const;

export default function SettingsPage() {
  return (
    <PageContainer>
      <PageHeader title="Settings" description="Manage your workspace and how your email is sent." />

      <section aria-labelledby="workspace-heading" className="rounded-xl border bg-white">
        <div className="border-b px-5 py-4">
          <h2 id="workspace-heading" className="font-semibold text-zinc-900">
            Workspace
          </h2>
        </div>
        {/* Workspace details depend on the logged-in user, so they stream in. */}
        <Suspense fallback={<WorkspaceDetailsSkeleton />}>
          <WorkspaceDetails />
        </Suspense>
      </section>

      <EmptyState
        icon={Server}
        title="Sending provider"
        description="Connect your own email service (Amazon SES, Resend, SMTP and more) so your campaigns can be delivered."
        phase={2}
      />
    </PageContainer>
  );
}

// This is the pattern every data-showing page should follow: an async
// component inside <Suspense> that checks access itself, right next to the
// data, instead of relying on the layout.
async function WorkspaceDetails() {
  const workspace = await requireActiveWorkspace();

  return (
    <dl className="divide-y">
      <DetailRow label="Name">{workspace.name}</DetailRow>
      <DetailRow label="Slug">
        <code className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-[0.85em] break-all">
          {workspace.slug}
        </code>
      </DetailRow>
      <DetailRow label="Your role">
        <span className="inline-flex rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
          {ROLE_LABELS[workspace.role]}
        </span>
      </DetailRow>
    </dl>
  );
}

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 px-5 py-4 sm:flex-row sm:items-center sm:gap-4">
      <dt className="w-32 shrink-0 text-sm text-zinc-500">{label}</dt>
      <dd className="min-w-0 text-sm font-medium text-zinc-900">{children}</dd>
    </div>
  );
}

function WorkspaceDetailsSkeleton() {
  return (
    <div className="divide-y">
      {["w-40", "w-28", "w-16"].map((width) => (
        <div key={width} className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-center sm:gap-4">
          <Skeleton className="h-4 w-20 sm:w-32" />
          <Skeleton className={`h-4 ${width}`} />
        </div>
      ))}
    </div>
  );
}
