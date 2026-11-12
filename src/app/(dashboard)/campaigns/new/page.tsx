import { createHash } from "node:crypto";
import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { NewCampaignForm } from "@/components/campaigns/new-campaign-form";
import { PageContainer } from "@/components/dashboard/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { getBrandTheme } from "@/lib/brand-kit";
import { listTemplates } from "@/lib/templates/queries";
import { STARTERS, STARTER_CATEGORIES } from "@/lib/templates/starters";
import { requireActiveWorkspace } from "@/lib/workspace";

export const metadata: Metadata = { title: "Create campaign" };

// Step 1 of a campaign: a name and a starting design. Everything after that
// (who gets it, sender, subject, sending) happens on the campaign's own page.
export default function NewCampaignPage() {
  return (
    <PageContainer>
      <div className="flex flex-col gap-3">
        <Link
          href="/campaigns"
          className="inline-flex w-fit items-center gap-1.5 text-sm font-medium text-zinc-500 hover:text-zinc-900"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Campaigns
        </Link>
        <div className="flex flex-col gap-1.5">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 sm:text-3xl">Create a campaign</h1>
          <p className="text-sm text-zinc-500 sm:text-base">
            Give it a name and pick a design to start from. You&apos;ll choose who gets it next.
          </p>
        </div>
      </div>
      <Suspense fallback={<FormSkeleton />}>
        <NewCampaignContent />
      </Suspense>
    </PageContainer>
  );
}

async function NewCampaignContent() {
  // Checks login + workspace right next to the data (see ../../layout.tsx).
  const ws = await requireActiveWorkspace();
  const [templates, theme] = await Promise.all([listTemplates(ws.id), getBrandTheme(ws)]);

  // Changes when the brand kit changes, so the starter previews reload (same as /templates).
  const previewVersion = createHash("sha256").update(JSON.stringify(theme)).digest("hex").slice(0, 12);

  return (
    <NewCampaignForm
      templates={templates.map((t) => ({
        id: t.id,
        name: t.name,
        subject: t.subject,
        updatedAt: t.updatedAt.toISOString(),
      }))}
      starters={STARTERS}
      categories={STARTER_CATEGORIES}
      previewVersion={previewVersion}
    />
  );
}

function FormSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-28 w-full rounded-xl" />
      <Skeleton className="h-8 w-72" />
      <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="aspect-[4/5] w-full rounded-xl" />
        ))}
      </div>
    </div>
  );
}
