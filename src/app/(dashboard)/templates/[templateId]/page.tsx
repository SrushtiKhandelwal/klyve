import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Loader2 } from "lucide-react";
import { TemplateEditorShell } from "@/components/templates/template-editor-shell";
import { getBrandTheme } from "@/lib/brand-kit";
import { getAttributeDefinitions } from "@/lib/contacts/lookups";
import { getVerifiedSenders } from "@/lib/email/senders";
import { BUILTIN_MERGE_TAGS, attributeMergeTag, type MergeTag } from "@/lib/templates/document";
import { getTemplate } from "@/lib/templates/queries";
import { sampleAttributeValue } from "@/lib/templates/sample-data";
import { requireUser } from "@/lib/session";
import { requireActiveWorkspace } from "@/lib/workspace";

export const metadata: Metadata = { title: "Edit template" };

type Params = Promise<{ templateId: string }>;

// The editor fills the whole content area (everything right of the sidebar).
// Phones: the top bar is 3.5rem tall, so the editor gets the rest of the screen
// (same height rule the editor itself uses, so nothing scrolls twice).
// The template loads inside <Suspense> because it depends on the user and the URL.
export default function TemplateEditorPage({ params }: { params: Params }) {
  return (
    <div className="flex h-[calc(100dvh-3.5rem)] flex-col bg-white md:h-dvh">
      <Suspense fallback={<EditorLoading />}>
        <EditorContent params={params} />
      </Suspense>
    </div>
  );
}

async function EditorContent({ params }: { params: Params }) {
  // Checks login + workspace right next to the data (see ../../layout.tsx).
  const [ws, user] = await Promise.all([requireActiveWorkspace(), requireUser()]);
  const { templateId } = await params;

  const [template, theme, attributes, senders] = await Promise.all([
    // Filtered by workspace: another workspace's id is "not found", never shown.
    getTemplate(ws.id, templateId),
    getBrandTheme(ws),
    getAttributeDefinitions(ws.id),
    getVerifiedSenders(ws.id),
  ]);
  if (!template) notFound();

  const mergeTags: MergeTag[] = [
    ...BUILTIN_MERGE_TAGS,
    // Custom fields, with the same example values the previews use.
    ...attributes.map((a) => ({
      tag: attributeMergeTag(a.key),
      label: a.label,
      example: String(sampleAttributeValue(a.key, a.type) ?? ""),
    })),
  ];

  return (
    <TemplateEditorShell
      // A new key when another template opens, so the editor starts fresh.
      key={template.id}
      templateId={template.id}
      name={template.name}
      document={template.document}
      subject={template.subject}
      preheader={template.preheader}
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
