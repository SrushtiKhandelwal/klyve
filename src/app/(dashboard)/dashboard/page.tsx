import { Suspense } from "react";
import type { Metadata } from "next";
import {
  AutomationsSummary,
  AutomationsSummaryHeader,
  AutomationsSummarySkeleton,
} from "@/components/dashboard/automations-summary";
import { GettingStarted, GettingStartedSkeleton } from "@/components/dashboard/getting-started";
import { PerformanceOverview, PerformanceOverviewSkeleton } from "@/components/dashboard/performance-overview";
import { QuickActions } from "@/components/dashboard/quick-actions";
import {
  RecentCampaigns,
  RecentCampaignsHeader,
  RecentCampaignsSkeleton,
} from "@/components/dashboard/recent-campaigns";
import { PageContainer, PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { requireUser } from "@/lib/session";
import { requireActiveWorkspace } from "@/lib/workspace";

export const metadata: Metadata = { title: "Home" };

// The dashboard home, top to bottom:
//   greeting → getting-started checklist (or "You're all set") → quick actions
//   → last 30 days → recent campaigns + automations.
// The page frame and headings are static and show instantly; every part that
// reads this workspace's data streams in inside its own <Suspense>.
export default function DashboardPage() {
  return (
    <PageContainer>
      {/* The greeting needs the user's name, so it streams in. */}
      <Suspense fallback={<WelcomeSkeleton />}>
        <Welcome />
      </Suspense>

      {/* Renders its own heading, or a single line once every step is done. */}
      <Suspense fallback={<GettingStartedSkeleton />}>
        <GettingStarted />
      </Suspense>

      <section aria-labelledby="quick-actions" className="flex flex-col gap-4">
        <h2 id="quick-actions" className="text-lg font-semibold text-zinc-900">
          Quick actions
        </h2>
        <QuickActions />
      </section>

      <section aria-labelledby="performance" className="flex flex-col gap-4">
        <h2 id="performance" className="text-lg font-semibold text-zinc-900">
          Last 30 days
        </h2>
        <Suspense fallback={<PerformanceOverviewSkeleton />}>
          <PerformanceOverview />
        </Suspense>
      </section>

      {/* Side by side on wide screens, stacked on phones and tablets. */}
      <div className="grid gap-8 lg:grid-cols-3 lg:gap-6">
        <section aria-labelledby="recent-campaigns" className="flex min-w-0 flex-col gap-4 lg:col-span-2">
          <RecentCampaignsHeader />
          <Suspense fallback={<RecentCampaignsSkeleton />}>
            <RecentCampaigns />
          </Suspense>
        </section>

        <section aria-labelledby="automations-summary" className="flex min-w-0 flex-col gap-4">
          <AutomationsSummaryHeader />
          <Suspense fallback={<AutomationsSummarySkeleton />}>
            <AutomationsSummary />
          </Suspense>
        </section>
      </div>
    </PageContainer>
  );
}

async function Welcome() {
  // Checks login + workspace itself (see the rule in ../layout.tsx).
  const [user, workspace] = await Promise.all([requireUser(), requireActiveWorkspace()]);
  const firstName = user.name.trim().split(/\s+/)[0] || "there";

  return (
    <PageHeader
      title={`Welcome, ${firstName}`}
      description={
        <>
          Here&apos;s what&apos;s happening in <span className="font-medium text-zinc-700">{workspace.name}</span>.
        </>
      }
    />
  );
}

function WelcomeSkeleton() {
  return (
    <div className="flex flex-col gap-2.5">
      <Skeleton className="h-8 w-56 sm:h-9" />
      <Skeleton className="h-4 w-72 max-w-full" />
    </div>
  );
}
