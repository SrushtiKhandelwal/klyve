import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { FilterIcon, PencilIcon, PlusIcon, TriangleAlertIcon } from "lucide-react";
import { DeleteSegmentDialog } from "@/components/contacts/segments/delete-segment-dialog";
import { PageContainer, PageHeader } from "@/components/dashboard/page-header";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getAttributeDefinitions, getListOptions } from "@/lib/contacts/lookups";
import { countSegment, loadRulesContext, validateRulesForWorkspace } from "@/lib/segments/engine";
import { listSegmentCampaignOptions, listSegments } from "@/lib/segments/queries";
import { describeSegmentRules } from "@/lib/segments/rules";
import { requireActiveWorkspace } from "@/lib/workspace";

export const metadata: Metadata = { title: "Segments" };

const dateFormat = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone: "UTC" });

export default function SegmentsPage() {
  return (
    <PageContainer>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <PageHeader
          title="Segments"
          description="Saved filters that always stay up to date, like “subscribed contacts in Pune”."
        />
        <CreateSegmentButton />
      </div>

      {/* The list depends on the workspace, so it streams in. */}
      <Suspense fallback={<SegmentListSkeleton />}>
        <SegmentList />
      </Suspense>
    </PageContainer>
  );
}

function CreateSegmentButton() {
  return (
    <Button nativeButton={false} render={<Link href="/contacts/segments/new" />} className="self-start sm:self-auto">
      <PlusIcon />
      Create segment
    </Button>
  );
}

async function SegmentList() {
  const ws = await requireActiveWorkspace();
  const [segments, attributes, lists, campaigns, context] = await Promise.all([
    listSegments(ws.id),
    getAttributeDefinitions(ws.id),
    getListOptions(ws.id),
    listSegmentCampaignOptions(ws.id),
    loadRulesContext(ws.id),
  ]);

  if (segments.length === 0) {
    return (
      <div className="flex flex-col items-center rounded-2xl border border-dashed border-zinc-300 bg-white px-6 py-14 text-center sm:py-20">
        <span className="flex size-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
          <FilterIcon className="size-7" />
        </span>
        <h2 className="mt-5 text-lg font-semibold text-zinc-900">No segments yet</h2>
        <p className="mt-1.5 max-w-md text-sm text-zinc-500">
          A segment picks contacts by their details, for example everyone who is subscribed, lives in Pune and
          joined in the last 30 days. New contacts that match are included automatically.
        </p>
        <div className="mt-6">
          <CreateSegmentButton />
        </div>
      </div>
    );
  }

  const lookups = {
    attributeLabels: new Map(attributes.map((a) => [a.key, a.label])),
    listNames: new Map(lists.map((l) => [l.id, l.name])),
    campaignNames: new Map(campaigns.map((c) => [c.id, c.name])),
  };

  // Count every segment live. Field types and lists are loaded once above, so
  // each segment costs a single count query.
  const rows = await Promise.all(
    segments.map(async (segment) => {
      const checked = await validateRulesForWorkspace(ws.id, segment.rules, context);
      if (!checked.ok) return { segment, count: null, summary: null };
      return {
        segment,
        count: await countSegment(ws.id, checked.checked),
        summary: describeSegmentRules(checked.rules, lookups),
      };
    }),
  );

  return (
    <ul className="divide-y overflow-hidden rounded-xl border bg-white">
      {rows.map(({ segment, count, summary }) => (
        <li key={segment.id} className="flex items-start gap-3 px-5 py-4">
          <div className="min-w-0 flex-1">
            <Link
              href={`/contacts/segments/${segment.id}`}
              className="font-medium text-zinc-900 hover:text-emerald-700 hover:underline"
            >
              {segment.name}
            </Link>
            {summary ? (
              <p className="mt-0.5 line-clamp-2 text-sm break-words text-zinc-500">{summary}</p>
            ) : (
              <p className="mt-0.5 flex items-center gap-1.5 text-sm text-amber-700">
                <TriangleAlertIcon className="size-3.5" />
                Needs fixing: uses a field, list or campaign that was deleted.
              </p>
            )}
            <p className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs text-zinc-500">
              <span className="font-medium text-emerald-700">
                {count === null ? "—" : `${count.toLocaleString()} ${count === 1 ? "contact" : "contacts"}`}
              </span>
              <span>Updated {dateFormat.format(segment.updatedAt)}</span>
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Button
              variant="ghost"
              size="icon-sm"
              nativeButton={false}
              render={<Link href={`/contacts/segments/${segment.id}`} aria-label={`Edit ${segment.name}`} title="Edit" />}
            >
              <PencilIcon />
            </Button>
            <DeleteSegmentDialog segment={{ id: segment.id, name: segment.name }} compact />
          </div>
        </li>
      ))}
    </ul>
  );
}

function SegmentListSkeleton() {
  return (
    <div className="divide-y rounded-xl border bg-white">
      {[0, 1, 2].map((i) => (
        <div key={i} className="px-5 py-4">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="mt-2 h-4 w-72 max-w-full" />
          <Skeleton className="mt-2 h-3 w-32" />
        </div>
      ))}
    </div>
  );
}
