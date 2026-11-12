"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { updateCampaignDraftAction } from "@/app/actions/campaigns";
import { CampaignTestDialog } from "@/components/campaigns/send-test-dialog";
import { EmailEditor } from "@/components/editor/email-editor";
import type { BrandTheme, EmailDocument, MergeTag } from "@/lib/templates/document";

/**
 * Connects the drag-and-drop editor to a campaign's own design. Saving goes
 * through updateCampaignDraftAction (drafts only), so the template it was
 * started from never changes.
 */
export function CampaignDesignShell({
  campaignId,
  name,
  document,
  subject,
  preheader,
  theme,
  mergeTags,
  senderLabel,
  userEmail,
}: {
  campaignId: string;
  name: string;
  document: EmailDocument;
  subject: string;
  preheader: string;
  theme: BrandTheme;
  mergeTags: MergeTag[];
  senderLabel: string | null;
  userEmail: string;
}) {
  const [testOpen, setTestOpen] = useState(false);

  async function handleSave(input: { document: EmailDocument; subject: string; preheader: string }) {
    try {
      const result = await updateCampaignDraftAction(campaignId, input);
      return result.ok ? ({ ok: true } as const) : ({ ok: false, error: result.error } as const);
    } catch {
      return { ok: false, error: "Couldn't reach the server. Your changes are not saved yet." } as const;
    }
  }

  return (
    <>
      <EmailEditor
        initialDocument={document}
        theme={theme}
        mergeTags={mergeTags}
        subject={subject}
        preheader={preheader}
        onSave={handleSave}
        onSendTest={() => setTestOpen(true)}
        headerSlot={
          <div className="flex min-w-0 items-center gap-1.5">
            <Link
              href={`/campaigns/${campaignId}`}
              aria-label="Back to the campaign"
              className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
            >
              <ArrowLeft className="size-4" aria-hidden />
            </Link>
            <div className="flex min-w-0 flex-col leading-tight">
              <span className="text-[11px] font-medium tracking-wide text-emerald-700 uppercase">Campaign</span>
              <span className="truncate text-sm font-medium text-zinc-900">{name}</span>
            </div>
          </div>
        }
      />
      <CampaignTestDialog
        campaignId={campaignId}
        senderLabel={senderLabel}
        defaultTo={userEmail}
        open={testOpen}
        onOpenChange={setTestOpen}
      />
    </>
  );
}
