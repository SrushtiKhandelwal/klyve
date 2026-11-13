import { Suspense } from "react";
import type { Metadata } from "next";
import { PageContainer, PageHeader } from "@/components/dashboard/page-header";
import { AutoPauseList } from "@/components/settings/deliverability/auto-pauses";
import { BulkSenderRules } from "@/components/settings/deliverability/bulk-sender-rules";
import { DeliverabilityChecklist } from "@/components/settings/deliverability/checklist";
import { HealthCards } from "@/components/settings/deliverability/health-cards";
import { ProviderHealthList } from "@/components/settings/deliverability/provider-health";
import { Skeleton } from "@/components/ui/skeleton";
import { requireActiveWorkspace } from "@/lib/workspace";
import { getDeliverabilityData } from "./data";

export const metadata: Metadata = { title: "Deliverability" };

// Settings → Deliverability: how the workspace's email is being received
// (bounces, spam complaints, unsubscribes), campaigns we paused for safety,
// and a checklist of the settings that matter. Read-only, so every member
// can see it.
export default function DeliverabilityPage() {
  return (
    <PageContainer>
      <PageHeader
        title="Deliverability"
        description="How your emails are being received, and what to fix so they keep reaching the inbox."
      />

      {/* Depends on the logged-in user's workspace, so it streams in. */}
      <Suspense fallback={<DeliverabilitySkeleton />}>
        <DeliverabilitySection />
      </Suspense>

      <BulkSenderRules />
    </PageContainer>
  );
}

async function DeliverabilitySection() {
  const ws = await requireActiveWorkspace();
  const data = await getDeliverabilityData(ws.id);

  return (
    <>
      <HealthCards overall={data.health.overall} days={data.health.days} />
      <ProviderHealthList providers={data.health.providers} />
      <AutoPauseList pauses={data.health.autoPauses} />
      <DeliverabilityChecklist data={data} />
    </>
  );
}

function DeliverabilitySkeleton() {
  return (
    <>
      <div className="grid gap-4 md:grid-cols-3">
        <Skeleton className="h-48 rounded-xl" />
        <Skeleton className="h-48 rounded-xl" />
        <Skeleton className="h-48 rounded-xl" />
      </div>
      <Skeleton className="h-40 rounded-xl" />
      <Skeleton className="h-64 rounded-xl" />
    </>
  );
}
