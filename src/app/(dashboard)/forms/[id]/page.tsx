import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Loader2 } from "lucide-react";
import { FormBuilder } from "@/components/forms/builder/form-builder";
import { EmbedPanel } from "@/components/forms/embed/embed-panel";
import { FormStats } from "@/components/forms/stats/form-stats";
import { Skeleton } from "@/components/ui/skeleton";
import { getBrandTheme } from "@/lib/brand-kit";
import { getAttributeDefinitions, getListOptions } from "@/lib/contacts/lookups";
import { FORM_LIMITS, canDeleteForm, getDoubleOptIn, getForm } from "@/lib/forms/queries";
import { requireActiveWorkspace } from "@/lib/workspace";

export const metadata: Metadata = { title: "Edit form" };

type Params = Promise<{ id: string }>;

// One sign-up form in the builder. Everything depends on the user and the URL,
// so it loads inside <Suspense> (the frame shows instantly).
export default function FormBuilderPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<BuilderLoading />}>
      <BuilderContent params={params} />
    </Suspense>
  );
}

async function BuilderContent({ params }: { params: Params }) {
  // Checks login + workspace right next to the data (see ../../layout.tsx).
  const ws = await requireActiveWorkspace();
  const { id } = await params;

  // Filtered by workspace: another workspace's id is "not found", never shown.
  const [form, theme, lists, attributes, doubleOptIn] = await Promise.all([
    getForm(ws, id),
    getBrandTheme(ws),
    getListOptions(ws.id),
    getAttributeDefinitions(ws.id),
    getDoubleOptIn(ws),
  ]);
  if (!form) notFound();

  return (
    <FormBuilder
      // A fresh builder if another form opens in the same spot.
      key={form.id}
      form={{
        id: form.id,
        name: form.name,
        publicId: form.publicId,
        status: form.status,
        config: form.config,
        listIds: form.listIds,
      }}
      brand={{ name: theme.companyName, logoUrl: theme.logoUrl }}
      lists={lists}
      attributes={attributes.map((a) => ({ key: a.key, label: a.label, type: a.type }))}
      doubleOptIn={doubleOptIn}
      canDelete={canDeleteForm(ws.role)}
      nameMax={FORM_LIMITS.nameMax}
      stats={
        <Suspense fallback={<Skeleton className="h-48 w-full rounded-xl" />}>
          <FormStats formId={form.id} />
        </Suspense>
      }
      share={<EmbedPanel publicId={form.publicId} formName={form.name} />}
    />
  );
}

function BuilderLoading() {
  return (
    <div className="flex min-h-[60dvh] flex-col items-center justify-center gap-3 text-sm text-zinc-500">
      <Loader2 className="size-6 animate-spin text-emerald-600" aria-hidden />
      Opening the form builder…
    </div>
  );
}
