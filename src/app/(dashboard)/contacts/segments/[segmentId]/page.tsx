import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SegmentBuilder } from "@/components/contacts/segments/segment-builder";
import { SegmentBuilderSkeleton } from "@/components/contacts/segments/segment-builder-skeleton";
import {
  SegmentContactsTable,
  SegmentContactsTableSkeleton,
} from "@/components/contacts/segments/segment-contacts-table";
import { PageContainer, PageHeader } from "@/components/dashboard/page-header";
import { getAttributeDefinitions, getListOptions } from "@/lib/contacts/lookups";
import { getSegment } from "@/lib/segments/queries";
import { requireActiveWorkspace } from "@/lib/workspace";
import { BackToSegments } from "../back-link";

export const metadata: Metadata = { title: "Edit segment" };

export default function EditSegmentPage({ params }: { params: Promise<{ segmentId: string }> }) {
  return (
    <PageContainer>
      <BackToSegments />
      {/* The segment id comes from the URL, which is only known at request time. */}
      <Suspense fallback={<SegmentBuilderSkeleton />}>
        <EditSegment params={params} />
      </Suspense>
    </PageContainer>
  );
}

async function EditSegment({ params }: { params: Promise<{ segmentId: string }> }) {
  const { segmentId } = await params;
  const ws = await requireActiveWorkspace();
  const [segment, attributes, lists] = await Promise.all([
    getSegment(ws.id, segmentId),
    getAttributeDefinitions(ws.id),
    getListOptions(ws.id),
  ]);

  // Unknown id, or a segment from another workspace: both are "not found".
  if (!segment) notFound();

  return (
    <>
      <PageHeader title={segment.name} description="Change the conditions and save to update this segment." />
      {/* key: start the editor fresh when moving to another segment (e.g. after Duplicate). */}
      <SegmentBuilder
        key={segment.id}
        segment={{ id: segment.id, name: segment.name, rules: segment.rules }}
        attributes={attributes}
        lists={lists}
      />
      <Suspense fallback={<SegmentContactsTableSkeleton />}>
        <SegmentContactsTable workspaceId={ws.id} rules={segment.rules} />
      </Suspense>
    </>
  );
}
