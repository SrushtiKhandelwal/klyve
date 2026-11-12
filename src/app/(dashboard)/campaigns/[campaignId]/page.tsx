import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getAudienceCountAction, getAudienceSourcesAction } from "@/app/actions/campaigns";
import type { AudienceSources } from "@/components/campaigns/setup/recipients-editor";
import { CampaignSetup } from "@/components/campaigns/setup/campaign-setup";
import type { SenderChoice } from "@/components/campaigns/setup/sender-editor";
import { CampaignStatusView } from "@/components/campaigns/status/campaign-status-view";
import { CampaignSummary } from "@/components/campaigns/status/campaign-summary";
import { toProgressView } from "@/components/campaigns/status/progress";
import { PageContainer } from "@/components/dashboard/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import type { Audience } from "@/lib/campaigns/audience";
import { CAMPAIGN_LIMITS, canDeleteCampaign, getCampaign, getCampaignProgress, type CampaignDetail } from "@/lib/campaigns/queries";
import { getAttributeDefinitions, getListOptions } from "@/lib/contacts/lookups";
import { getVerifiedSenders, listProviderChoices } from "@/lib/email/senders";
import { listSegments } from "@/lib/segments/queries";
import { BUILTIN_MERGE_TAGS, attributeMergeTag, type MergeTag } from "@/lib/templates/document";
import { sampleAttributeValue } from "@/lib/templates/sample-data";
import { requireUser } from "@/lib/session";
import { requireActiveWorkspace, type ActiveWorkspace } from "@/lib/workspace";

export const metadata: Metadata = { title: "Campaign" };

type Params = Promise<{ campaignId: string }>;

// One campaign. A DRAFT shows the setup checklist; anything else shows the
// live status page. Everything depends on the user and the URL, so it loads
// inside <Suspense> (the frame shows instantly).
export default function CampaignPage({ params }: { params: Params }) {
  return (
    <PageContainer>
      <Suspense fallback={<CampaignSkeleton />}>
        <CampaignContent params={params} />
      </Suspense>
    </PageContainer>
  );
}

async function CampaignContent({ params }: { params: Params }) {
  // Checks login + workspace right next to the data (see ../../layout.tsx).
  const [ws, user] = await Promise.all([requireActiveWorkspace(), requireUser()]);
  const { campaignId } = await params;

  // Filtered by workspace: another workspace's id is "not found", never shown.
  const campaign = await getCampaign(ws.id, campaignId);
  if (!campaign) notFound();

  const canDelete = canDeleteCampaign({ userId: user.id, role: ws.role }, campaign.createdById);

  if (campaign.status === "DRAFT") {
    return <DraftContent ws={ws} campaign={campaign} userEmail={user.email} canDelete={canDelete} />;
  }
  return <StatusContent ws={ws} campaign={campaign} canDelete={canDelete} />;
}

// ── Draft: the setup checklist ──────────────────────────────────────────────

async function DraftContent({
  ws,
  campaign,
  userEmail,
  canDelete,
}: {
  ws: ActiveWorkspace;
  campaign: CampaignDetail;
  userEmail: string;
  canDelete: boolean;
}) {
  // These Server Actions check the workspace themselves; calling them here
  // just reuses the same code the browser uses later.
  const [sourcesResult, countResult, senders, providers, attributes] = await Promise.all([
    getAudienceSourcesAction(),
    getAudienceCountAction(campaign.audience),
    getVerifiedSenders(ws.id),
    listProviderChoices(ws.id),
    getAttributeDefinitions(ws.id),
  ]);

  const sources: AudienceSources = sourcesResult.ok
    ? {
        lists: sourcesResult.sources.lists.map((l) => ({ id: l.id, name: l.name, count: l.subscribed, unit: "subscribed" as const })),
        segments: sourcesResult.sources.segments.map((s) => ({ id: s.id, name: s.name, count: s.subscribed, unit: "subscribed" as const })),
      }
    : { lists: [], segments: [] };

  // Each sender sends through its own provider, else the workspace default.
  const defaultProvider = providers.find((p) => p.isDefault) ?? null;
  const senderChoices: SenderChoice[] = senders.map((s) => {
    const provider = (s.providerId && providers.find((p) => p.id === s.providerId)) || defaultProvider;
    return {
      id: s.id,
      email: s.email,
      name: s.name,
      provider: provider ? { name: provider.name, status: provider.status } : null,
    };
  });

  const mergeTags: MergeTag[] = [
    ...BUILTIN_MERGE_TAGS,
    ...attributes.map((a) => ({
      tag: attributeMergeTag(a.key),
      label: a.label,
      example: String(sampleAttributeValue(a.key, a.type) ?? ""),
    })),
  ];

  return (
    <div className="mx-auto w-full max-w-3xl">
      <CampaignSetup
        // A fresh editor if another campaign opens in the same spot.
        key={campaign.id}
        campaign={{
          id: campaign.id,
          name: campaign.name,
          subject: campaign.subject,
          preheader: campaign.preheader,
          audience: campaign.audience,
          senderId: campaign.sender?.id ?? null,
          document: campaign.document,
          canDelete,
        }}
        sources={sources}
        senders={senderChoices}
        mergeTags={mergeTags}
        userEmail={userEmail}
        initialRecipientCount={countResult.ok ? countResult.count.recipients : null}
        limits={{ nameMax: CAMPAIGN_LIMITS.nameMax, subjectMax: CAMPAIGN_LIMITS.subjectMax, preheaderMax: CAMPAIGN_LIMITS.preheaderMax }}
      />
    </div>
  );
}

// ── Scheduled / sending / finished: the status page ─────────────────────────

async function StatusContent({ ws, campaign, canDelete }: { ws: ActiveWorkspace; campaign: CampaignDetail; canDelete: boolean }) {
  const [progress, lists, segments] = await Promise.all([
    getCampaignProgress(ws.id, campaign.id),
    getListOptions(ws.id),
    listSegments(ws.id),
  ]);
  if (!progress) notFound(); // deleted a moment ago

  const iso = (d: Date | null) => d?.toISOString() ?? null;

  return (
    <CampaignStatusView
      campaign={{ id: campaign.id, name: campaign.name, scheduledAt: iso(campaign.scheduledAt), canDelete }}
      initialProgress={toProgressView(progress)}
    >
      <CampaignSummary
        subject={campaign.subject}
        preheader={campaign.preheader}
        senderLabel={campaign.sender ? `${campaign.sender.name} <${campaign.sender.email}>` : null}
        providerName={campaign.provider?.name ?? null}
        audienceText={describeAudience(campaign.audience, lists, segments)}
        document={campaign.document}
        createdAt={campaign.createdAt.toISOString()}
        scheduledAt={iso(campaign.scheduledAt)}
        startedAt={iso(campaign.startedAt)}
        finishedAt={iso(campaign.finishedAt)}
      />
    </CampaignStatusView>
  );
}

/** "Lists: Newsletter, VIPs · Segments: Pune · Left out: Unengaged" */
function describeAudience(audience: Audience, lists: { id: string; name: string }[], segments: { id: string; name: string }[]) {
  const listName = (id: string) => lists.find((l) => l.id === id)?.name ?? "a deleted list";
  const segmentName = (id: string) => segments.find((s) => s.id === id)?.name ?? "a deleted segment";
  const parts: string[] = [];
  if (audience.listIds.length) parts.push(`Lists: ${audience.listIds.map(listName).join(", ")}`);
  if (audience.segmentIds.length) parts.push(`Segments: ${audience.segmentIds.map(segmentName).join(", ")}`);
  const excluded = [...audience.excludeListIds.map(listName), ...audience.excludeSegmentIds.map(segmentName)];
  if (excluded.length) parts.push(`Left out: ${excluded.join(", ")}`);
  return parts.length ? parts.join(" · ") : "No lists or segments";
}

function CampaignSkeleton() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <div className="flex flex-col gap-3">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-8 w-72 max-w-full" />
        <Skeleton className="h-5 w-40" />
      </div>
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className="flex items-center gap-4 rounded-xl border bg-white p-5">
          <Skeleton className="size-9 rounded-full" />
          <div className="flex flex-1 flex-col gap-1.5">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-56 max-w-full" />
          </div>
          <Skeleton className="h-7 w-16" />
        </div>
      ))}
    </div>
  );
}
