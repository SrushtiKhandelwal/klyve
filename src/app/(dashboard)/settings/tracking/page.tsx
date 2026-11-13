import { Suspense } from "react";
import type { Metadata } from "next";
import { PageContainer, PageHeader } from "@/components/dashboard/page-header";
import { UtmSettingsForm } from "@/components/settings/tracking/utm-settings-form";
import { Skeleton } from "@/components/ui/skeleton";
import { getUtmSettings } from "@/lib/tracking/utm-settings";
import { requireActiveWorkspace } from "@/lib/workspace";

export const metadata: Metadata = { title: "Link tracking" };

// Settings → Link tracking: UTM tags added to the links in campaign and
// automation emails. Owners and admins can change it; members can look.
export default function TrackingSettingsPage() {
  return (
    <PageContainer>
      <PageHeader
        title="Link tracking"
        description="See in your own website analytics which email brought each visitor."
      />
      {/* Depends on the logged-in user's workspace, so it streams in. */}
      <Suspense fallback={<TrackingSkeleton />}>
        <TrackingSection />
      </Suspense>
    </PageContainer>
  );
}

async function TrackingSection() {
  const ws = await requireActiveWorkspace();
  const settings = await getUtmSettings(ws.id);
  return (
    <UtmSettingsForm
      initial={settings}
      canManage={ws.role === "OWNER" || ws.role === "ADMIN"}
    />
  );
}

function TrackingSkeleton() {
  return (
    <div className="grid gap-6">
      {[0, 1].map((i) => (
        <div key={i} className="grid gap-3 rounded-xl border bg-white p-5">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-2/3" />
        </div>
      ))}
    </div>
  );
}
