"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { saveStepEmailAction } from "@/app/actions/automations";
import { EmailEditor } from "@/components/editor/email-editor";
import type { BrandTheme, EmailDocument, MergeTag } from "@/lib/templates/document";
import { StepTestDialog } from "./builder/builder-dialogs";
import type { SenderOption } from "./builder/step-panel";

/**
 * Connects the drag-and-drop editor to ONE "Send email" step of an
 * automation. Saving writes the design, subject and preview text back into
 * the automation's steps (drafts and paused automations only).
 */
export function StepEmailShell({
  automationId,
  automationName,
  stepId,
  stepName,
  senderId,
  document,
  subject,
  preheader,
  theme,
  mergeTags,
  senders,
  userEmail,
}: {
  automationId: string;
  automationName: string;
  stepId: string;
  stepName: string;
  senderId: string | null;
  document: EmailDocument;
  subject: string;
  preheader: string;
  theme: BrandTheme;
  mergeTags: MergeTag[];
  senders: SenderOption[];
  userEmail: string;
}) {
  const [testOpen, setTestOpen] = useState(false);

  async function handleSave(input: { document: EmailDocument; subject: string; preheader: string }) {
    try {
      const result = await saveStepEmailAction(automationId, stepId, input);
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
              href={`/automations/${automationId}`}
              aria-label="Back to the automation"
              className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
            >
              <ArrowLeft className="size-4" aria-hidden />
            </Link>
            <div className="flex min-w-0 flex-col leading-tight">
              <span className="truncate text-[11px] font-medium tracking-wide text-emerald-700 uppercase">{automationName}</span>
              <span className="truncate text-sm font-medium text-zinc-900">{stepName}</span>
            </div>
          </div>
        }
      />
      <StepTestDialog
        automationId={automationId}
        stepId={testOpen ? stepId : null}
        defaultSenderId={senderId}
        senders={senders}
        defaultTo={userEmail}
        // The editor autosaves; the test uses the last saved version.
        beforeSend={async () => true}
        onOpenChange={setTestOpen}
      />
    </>
  );
}
