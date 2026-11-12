import { Suspense } from "react";
import type { Metadata } from "next";
import { SegmentBuilder } from "@/components/contacts/segments/segment-builder";
import { SegmentBuilderSkeleton } from "@/components/contacts/segments/segment-builder-skeleton";
import { PageContainer, PageHeader } from "@/components/dashboard/page-header";
import { getAttributeDefinitions, getListOptions } from "@/lib/contacts/lookups";
import { listSegmentCampaignOptions } from "@/lib/segments/queries";
import { requireActiveWorkspace } from "@/lib/workspace";
import { BackToSegments } from "../back-link";

export const metadata: Metadata = { title: "Create segment" };

export default function NewSegmentPage() {
  return (
    <PageContainer>
      <div className="flex flex-col gap-3">
        <BackToSegments />
        <PageHeader
          title="Create segment"
          description="Pick the conditions contacts must meet. The preview updates as you go."
        />
      </div>
      <Suspense fallback={<SegmentBuilderSkeleton />}>
        <NewSegmentBuilder />
      </Suspense>
    </PageContainer>
  );
}

async function NewSegmentBuilder() {
  const ws = await requireActiveWorkspace();
  const [attributes, lists, campaigns] = await Promise.all([
    getAttributeDefinitions(ws.id),
    getListOptions(ws.id),
    listSegmentCampaignOptions(ws.id),
  ]);
  return <SegmentBuilder attributes={attributes} lists={lists} campaigns={campaigns} />;
}
