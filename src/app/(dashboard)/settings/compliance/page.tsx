import { Suspense } from "react";
import type { Metadata } from "next";
import { PageContainer, PageHeader } from "@/components/dashboard/page-header";
import { ConsentLegalBox } from "@/components/settings/compliance/consent-legal-box";
import { DoubleOptInForm } from "@/components/settings/compliance/double-opt-in-form";
import { Skeleton } from "@/components/ui/skeleton";
import { absoluteUrl } from "@/lib/app-url";
import { getVerifiedSenders } from "@/lib/email/senders";
import { getOptInBrand, getOptInSettings, OPTIN_LIMITS } from "@/lib/optin";
import { requireUser } from "@/lib/session";
import { requireActiveWorkspace } from "@/lib/workspace";

export const metadata: Metadata = { title: "Compliance" };

// Settings → Compliance: double opt-in and the legal basics of email
// marketing. Owners and admins can change it; members can look.
export default function ComplianceSettingsPage() {
  return (
    <PageContainer>
      <PageHeader
        title="Compliance"
        description="Make sure the people you email really asked for it, and keep proof that they did."
      />
      {/* Depends on the logged-in user's workspace, so it streams in. */}
      <Suspense fallback={<ComplianceSkeleton />}>
        <ComplianceSection />
      </Suspense>
    </PageContainer>
  );
}

async function ComplianceSection() {
  const ws = await requireActiveWorkspace();
  const [user, settings, senders, brand] = await Promise.all([
    requireUser(),
    getOptInSettings(ws),
    getVerifiedSenders(ws.id),
    getOptInBrand(ws),
  ]);

  return (
    <div className="grid gap-6">
      <DoubleOptInForm
        initial={{
          enabled: settings.enabled,
          // A sender that was deleted or un-verified isn't offered any more.
          senderId: settings.sender?.id ?? "",
          subject: settings.subject,
          message: settings.message,
        }}
        senders={senders.map((s) => ({ id: s.id, label: `${s.name} <${s.email}>` }))}
        brand={brand}
        previewLinkUrl={absoluteUrl("/c/test")}
        canManage={ws.role === "OWNER" || ws.role === "ADMIN"}
        userEmail={user.email}
        limits={OPTIN_LIMITS}
      />
      <ConsentLegalBox addressMissing={!brand.address} />
    </div>
  );
}

function ComplianceSkeleton() {
  return (
    <div className="grid gap-6">
      {[0, 1, 2].map((i) => (
        <div key={i} className="grid gap-3 rounded-xl border bg-white p-5">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-2/3" />
        </div>
      ))}
    </div>
  );
}
