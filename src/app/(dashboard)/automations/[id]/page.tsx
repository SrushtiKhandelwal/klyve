import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Loader2 } from "lucide-react";
import { AutomationBuilder } from "@/components/automations/builder/automation-builder";
import { AutomationStats } from "@/components/automations/stats/automation-stats";
import { Skeleton } from "@/components/ui/skeleton";
import { MANUAL_ENROLL_CAP, getAutomation, getAutomationLookups } from "@/lib/automations/queries";
import { getBrandTheme } from "@/lib/brand-kit";
import { getVerifiedSenders } from "@/lib/email/senders";
import { BUILTIN_MERGE_TAGS, attributeMergeTag, type MergeTag } from "@/lib/templates/document";
import { sampleAttributeValue } from "@/lib/templates/sample-data";
import type { AttributeTypeValue } from "@/lib/contacts/common";
import { requireUser } from "@/lib/session";
import { requireActiveWorkspace } from "@/lib/workspace";

export const metadata: Metadata = { title: "Edit automation" };

type Params = Promise<{ id: string }>;

// One automation in the visual builder. Everything depends on the user and the
// URL, so it loads inside <Suspense> (the frame shows instantly).
export default function AutomationBuilderPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<BuilderLoading />}>
      <BuilderContent params={params} />
    </Suspense>
  );
}

async function BuilderContent({ params }: { params: Params }) {
  // Checks login + workspace right next to the data (see ../../layout.tsx).
  const [ws, user] = await Promise.all([requireActiveWorkspace(), requireUser()]);
  const { id } = await params;

  // Filtered by workspace: another workspace's id is "not found", never shown.
  const [automation, lookups, theme, senders] = await Promise.all([
    getAutomation(ws, id),
    getAutomationLookups(ws),
    getBrandTheme(ws),
    getVerifiedSenders(ws.id),
  ]);
  if (!automation) notFound();

  const mergeTags: MergeTag[] = [
    ...BUILTIN_MERGE_TAGS,
    ...lookups.attributes.map((a) => ({
      tag: attributeMergeTag(a.key),
      label: a.label,
      example: String(sampleAttributeValue(a.key, a.type as AttributeTypeValue) ?? ""),
    })),
  ];

  return (
    <AutomationBuilder
      // A fresh builder when it's turned on/off (refresh() brings the new
      // status), so read-only mode and the saved workflow always match.
      key={`${automation.id}:${automation.status}`}
      automation={{
        id: automation.id,
        name: automation.name,
        status: automation.status,
        trigger: automation.trigger,
        steps: automation.steps,
        allowReentry: automation.allowReentry,
      }}
      lookups={lookups}
      senders={senders.map((s) => ({ id: s.id, label: s.name ? `${s.name} <${s.email}>` : s.email }))}
      theme={theme}
      mergeTags={mergeTags}
      canManage={ws.role === "OWNER" || ws.role === "ADMIN"}
      userEmail={user.email}
      enrollCap={MANUAL_ENROLL_CAP}
      stats={
        <Suspense fallback={<Skeleton className="h-48 w-full rounded-xl" />}>
          <AutomationStats automationId={automation.id} />
        </Suspense>
      }
    />
  );
}

function BuilderLoading() {
  return (
    <div className="flex min-h-[60dvh] flex-col items-center justify-center gap-3 text-sm text-zinc-500">
      <Loader2 className="size-6 animate-spin text-emerald-600" aria-hidden />
      Opening the automation builder…
    </div>
  );
}
