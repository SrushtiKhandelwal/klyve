import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Loader2 } from "lucide-react";
import { CampaignDesignShell } from "@/components/campaigns/campaign-design-shell";
import { getBrandTheme } from "@/lib/brand-kit";
import { getCampaign } from "@/lib/campaigns/queries";
import { getAttributeDefinitions } from "@/lib/contacts/lookups";
import { BUILTIN_MERGE_TAGS, attributeMergeTag, emptyDocument, type MergeTag } from "@/lib/templates/document";
import { sampleAttributeValue } from "@/lib/templates/sample-data";
import { requireUser } from "@/lib/session";
import { requireActiveWorkspace } from "@/lib/workspace";

export const metadata: Metadata = { title: "Edit campaign design" };

type Params = Promise<{ campaignId: string }>;

// The drag-and-drop editor for a campaign's OWN design, filling the whole
// content area like the template editor (same height rules, see
// templates/[templateId]/page.tsx). Loads inside <Suspense> because it
// depends on the user and the URL.
export default function CampaignDesignPage({ params }: { params: Params }) {
  return (
    <div className="flex h-[calc(100dvh-3.5rem)] flex-col bg-white md:h-dvh">
      <Suspense fallback={<EditorLoading />}>
        <DesignContent params={params} />
      </Suspense>
    </div>
  );
}

async function DesignContent({ params }: { params: Params }) {
  // Checks login + workspace right next to the data (see ../../../layout.tsx).
  const [ws, user] = await Promise.all([requireActiveWorkspace(), requireUser()]);
  const { campaignId } = await params;

  // Filtered by workspace: another workspace's id is "not found", never shown.
  const campaign = await getCampaign(ws.id, campaignId);
  if (!campaign) notFound();
  // Once scheduled or sent, the design is frozen: show the status page instead.
  if (campaign.status !== "DRAFT") redirect(`/campaigns/${campaign.id}`);

  const [theme, attributes] = await Promise.all([getBrandTheme(ws), getAttributeDefinitions(ws.id)]);

  const mergeTags: MergeTag[] = [
    ...BUILTIN_MERGE_TAGS,
    ...attributes.map((a) => ({
      tag: attributeMergeTag(a.key),
      label: a.label,
      example: String(sampleAttributeValue(a.key, a.type) ?? ""),
    })),
  ];

  return (
    <CampaignDesignShell
      // A new key when another campaign opens, so the editor starts fresh.
      key={campaign.id}
      campaignId={campaign.id}
      name={campaign.name}
      // A campaign whose design couldn't be read starts from a blank email in the brand.
      document={campaign.document ?? emptyDocument(theme)}
      subject={campaign.subject}
      preheader={campaign.preheader}
      theme={theme}
      mergeTags={mergeTags}
      senderLabel={campaign.sender?.verified ? `${campaign.sender.name} <${campaign.sender.email}>` : null}
      userEmail={user.email}
    />
  );
}

function EditorLoading() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 text-sm text-zinc-500">
      <Loader2 className="size-6 animate-spin text-emerald-600" aria-hidden />
      Opening the editor…
    </div>
  );
}
