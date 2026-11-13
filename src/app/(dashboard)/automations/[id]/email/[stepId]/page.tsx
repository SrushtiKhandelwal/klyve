import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Loader2 } from "lucide-react";
import { StepEmailShell } from "@/components/automations/step-email-shell";
import { getAutomation } from "@/lib/automations/queries";
import { findStep } from "@/lib/automations/schema";
import { getBrandTheme } from "@/lib/brand-kit";
import { getAttributeDefinitions } from "@/lib/contacts/lookups";
import { getVerifiedSenders } from "@/lib/email/senders";
import { BUILTIN_MERGE_TAGS, attributeMergeTag, type MergeTag } from "@/lib/templates/document";
import { sampleAttributeValue } from "@/lib/templates/sample-data";
import { requireUser } from "@/lib/session";
import { requireActiveWorkspace } from "@/lib/workspace";

export const metadata: Metadata = { title: "Edit automation email" };

type Params = Promise<{ id: string; stepId: string }>;

// The drag-and-drop editor for ONE "Send email" step of an automation, filling
// the whole content area like the template editor (same height rules, see
// templates/[templateId]/page.tsx). Saving writes the design back into the
// automation's steps. Loads inside <Suspense> because it depends on the user
// and the URL.
export default function AutomationEmailPage({ params }: { params: Params }) {
  return (
    <div className="flex h-[calc(100dvh-3.5rem)] flex-col bg-white md:h-dvh">
      <Suspense fallback={<EditorLoading />}>
        <EmailContent params={params} />
      </Suspense>
    </div>
  );
}

async function EmailContent({ params }: { params: Params }) {
  // Checks login + workspace right next to the data (see ../../../../layout.tsx).
  const [ws, user] = await Promise.all([requireActiveWorkspace(), requireUser()]);
  const { id, stepId } = await params;

  // Filtered by workspace: another workspace's id is "not found", never shown.
  const automation = await getAutomation(ws, id);
  if (!automation) notFound();
  const step = findStep(automation.steps, stepId);
  // A deleted step, or not an email: back to the builder.
  if (!step || step.type !== "send_email") redirect(`/automations/${automation.id}`);
  // While it's on, emails are frozen (people may be about to receive them).
  if (automation.status === "ACTIVE") redirect(`/automations/${automation.id}`);

  const [theme, attributes, senders] = await Promise.all([getBrandTheme(ws), getAttributeDefinitions(ws.id), getVerifiedSenders(ws.id)]);
  const mergeTags: MergeTag[] = [
    ...BUILTIN_MERGE_TAGS,
    ...attributes.map((a) => ({
      tag: attributeMergeTag(a.key),
      label: a.label,
      example: String(sampleAttributeValue(a.key, a.type) ?? ""),
    })),
  ];

  return (
    <StepEmailShell
      // A new key when another email opens, so the editor starts fresh.
      key={`${automation.id}:${step.id}`}
      automationId={automation.id}
      automationName={automation.name}
      stepId={step.id}
      stepName={step.name}
      senderId={step.senderId}
      document={step.document}
      subject={step.subject}
      preheader={step.preheader}
      theme={theme}
      mergeTags={mergeTags}
      senders={senders.map((s) => ({ id: s.id, label: s.name ? `${s.name} <${s.email}>` : s.email }))}
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
