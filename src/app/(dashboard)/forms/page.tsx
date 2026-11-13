import { Suspense } from "react";
import type { Metadata } from "next";
import { ClipboardList, Globe, LayoutTemplate, Smartphone } from "lucide-react";
import { Glyph } from "@/components/brand/glyph";
import { PageContainer, PageHeader } from "@/components/dashboard/page-header";
import { CreateFormButton } from "@/components/forms/create-form-button";
import { FormCard, type FormCardData } from "@/components/forms/form-card";
import { FormThumbnail } from "@/components/forms/form-thumbnail";
import { FormView } from "@/components/forms/form-view";
import { timeAgo } from "@/components/forms/time-ago";
import { Skeleton } from "@/components/ui/skeleton";
import { getBrandTheme } from "@/lib/brand-kit";
import { getAttributeDefinitions } from "@/lib/contacts/lookups";
import { canDeleteForm, listForms, type FormListItem } from "@/lib/forms/queries";
import { requireActiveWorkspace } from "@/lib/workspace";

export const metadata: Metadata = { title: "Forms" };

// The page frame is static. Everything that depends on the user (their forms,
// their brand) loads inside <Suspense>, so it streams in.
export default function FormsPage() {
  return (
    <PageContainer>
      <Suspense fallback={<FormsSkeleton />}>
        <FormsContent />
      </Suspense>
    </PageContainer>
  );
}

async function FormsContent() {
  // Checks login + workspace right next to the data (see ../layout.tsx).
  const ws = await requireActiveWorkspace();
  // Filtered by workspace inside listForms: other workspaces' forms never appear.
  const [forms, theme, attributes] = await Promise.all([listForms(ws), getBrandTheme(ws), getAttributeDefinitions(ws.id)]);

  if (forms.length === 0) {
    return (
      <>
        <Header showButton={false} />
        <FormsEmpty />
      </>
    );
  }

  const brand = { name: theme.companyName, logoUrl: theme.logoUrl };
  const attributeTypes = Object.fromEntries(attributes.map((a) => [a.key, a.type]));
  const cards = toCards(forms, canDeleteForm(ws.role));

  return (
    <>
      <Header showButton />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {forms.map((form, i) => (
          <FormCard
            key={form.id}
            form={cards[i]}
            // Rendered here on the server: the card only receives finished HTML.
            preview={
              <FormThumbnail>
                <FormView config={form.config} brand={brand} attributeTypes={attributeTypes} disabled idPrefix={`card-${form.id}`} />
              </FormThumbnail>
            }
          />
        ))}
      </div>
    </>
  );
}

/** What each card needs, with "Edited 5 min ago" worked out on the server. */
function toCards(forms: FormListItem[], canDelete: boolean): FormCardData[] {
  const now = Date.now();
  return forms.map((form) => ({
    id: form.id,
    name: form.name,
    publicId: form.publicId,
    status: form.status,
    submissionCount: form.submissionCount,
    updatedAt: form.updatedAt.toISOString(),
    updatedLabel: `Edited ${timeAgo(form.updatedAt.getTime(), now)}`,
    canDelete,
  }));
}

function Header({ showButton }: { showButton: boolean }) {
  return (
    <PageHeader
      title="Forms"
      description="Sign-up forms that add new subscribers to your lists."
      actions={showButton && <CreateFormButton />}
    />
  );
}

const PLACES = [
  { icon: LayoutTemplate, title: "Your website", text: "Paste it into a footer, a pop-up area or any page with one line of code." },
  { icon: Globe, title: "A landing page", text: "Every form gets its own page, so you don't even need a website." },
  { icon: Smartphone, title: "Your bio link", text: "Put the form's link in your Instagram, TikTok or WhatsApp profile." },
];

function FormsEmpty() {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed border-zinc-300 bg-white px-6 py-12 text-center sm:py-16">
      <Glyph icon={ClipboardList} size="xl" strokeWidth={1.5} className="size-10" />
      <h2 className="mt-5 text-lg font-semibold text-zinc-900">Grow your list with a sign-up form</h2>
      <p className="mt-1.5 max-w-md text-sm text-zinc-500">
        People type in their email, tick a box to agree, and land straight on your list, ready for your next campaign.
        It takes about a minute to make one.
      </p>
      <ul className="mt-8 grid w-full max-w-3xl gap-3 text-left sm:grid-cols-3">
        {PLACES.map((place) => (
          <li key={place.title} className="flex gap-3 rounded-xl border bg-zinc-50/60 p-4">
            <Glyph icon={place.icon} size="sm" className="mt-0.5" />
            <div className="min-w-0">
              <p className="text-sm font-medium text-zinc-900">{place.title}</p>
              <p className="mt-1 text-xs text-zinc-500">{place.text}</p>
            </div>
          </li>
        ))}
      </ul>
      <CreateFormButton className="mt-8" />
    </div>
  );
}

function FormsSkeleton() {
  return (
    <>
      <PageHeader title="Forms" description="Sign-up forms that add new subscribers to your lists." />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="overflow-hidden rounded-xl border bg-white">
            <Skeleton className="aspect-[4/3] w-full rounded-none" />
            <div className="flex flex-col gap-1.5 p-3">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
