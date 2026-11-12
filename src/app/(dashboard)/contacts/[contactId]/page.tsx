import { Suspense, type ReactNode } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PageContainer } from "@/components/dashboard/page-header";
import {
  ContactActivityCard,
  ContactActivityCardSkeleton,
} from "@/components/contacts/activity/contact-activity-card";
import { ContactDeleteButton } from "@/components/contacts/contact-delete-button";
import { ContactEditForm } from "@/components/contacts/contact-edit-form";
import { ContactListsCard } from "@/components/contacts/contact-lists-card";
import { ContactStatusBadge } from "@/components/contacts/contact-status-badge";
import { ContactStatusCard } from "@/components/contacts/contact-status-card";
import { Skeleton } from "@/components/ui/skeleton";
import { contactDisplayName, readAttributes } from "@/lib/contacts/common";
import { getAttributeDefinitions, getListOptions } from "@/lib/contacts/lookups";
import { getContact } from "@/lib/contacts/queries";
import { requireActiveWorkspace } from "@/lib/workspace";

export const metadata: Metadata = { title: "Contact" };

type Params = Promise<{ contactId: string }>;

// The frame (back link) is static. The contact itself depends on the user and
// the URL, so it loads inside <Suspense>.
export default function ContactPage({ params }: { params: Params }) {
  return (
    <PageContainer>
      <Link
        href="/contacts"
        className="-mb-4 inline-flex w-fit items-center gap-1.5 text-sm font-medium text-zinc-500 hover:text-zinc-900"
      >
        <ArrowLeft className="size-4" aria-hidden />
        All contacts
      </Link>
      <Suspense fallback={<ContactSkeleton />}>
        <ContactDetails params={params} />
      </Suspense>
    </PageContainer>
  );
}

const dateTimeFormat = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const SOURCE_LABELS: Record<string, string> = {
  manual: "Added by hand",
  import: "CSV import",
  form: "Sign-up form",
  api: "API",
};

async function ContactDetails({ params }: { params: Params }) {
  // Checks login + workspace right next to the data (see ../../layout.tsx).
  const ws = await requireActiveWorkspace();
  const { contactId } = await params;

  const [contact, attributes, lists] = await Promise.all([
    // Filtered by workspace: another workspace's id is "not found", never shown.
    getContact(ws.id, contactId),
    getAttributeDefinitions(ws.id),
    getListOptions(ws.id),
  ]);
  if (!contact) notFound();

  const name = contactDisplayName(contact);

  return (
    <>
      <div className="flex min-w-0 flex-col gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="min-w-0 text-2xl font-semibold tracking-tight break-words text-zinc-900 sm:text-3xl">
            {name}
          </h1>
          <ContactStatusBadge status={contact.status} />
        </div>
        {name !== contact.email && <p className="text-sm break-all text-zinc-500">{contact.email}</p>}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="flex min-w-0 flex-col gap-6 lg:col-span-2">
          <Card title="Details">
            {/* The key changes when the saved values change, which re-fills the
                form with them (e.g. the email in lower case) after a save. */}
            <ContactEditForm
              key={JSON.stringify([contact.email, contact.firstName, contact.lastName, contact.attributes])}
              contact={{
                id: contact.id,
                email: contact.email,
                firstName: contact.firstName,
                lastName: contact.lastName,
                attributes: readAttributes(contact.attributes),
              }}
              attributes={attributes}
            />
          </Card>

          <Card title="Lists">
            <ContactListsCard
              contactId={contact.id}
              memberOf={contact.lists.map((l) => ({ id: l.id, name: l.name }))}
              allLists={lists}
            />
          </Card>

          <Card title="Email activity">
            {/* Streams in on its own, so the rest of the page doesn't wait for it. */}
            <Suspense fallback={<ContactActivityCardSkeleton />}>
              <ContactActivityCard workspaceId={ws.id} contactId={contact.id} />
            </Suspense>
          </Card>
        </div>

        <div className="flex min-w-0 flex-col gap-6">
          <Card title="Subscription">
            <ContactStatusCard contactId={contact.id} status={contact.status} />
          </Card>

          <Card title="Info">
            <dl className="flex flex-col gap-3 p-5 text-sm">
              <InfoRow label="Added">
                <time dateTime={contact.createdAt.toISOString()}>
                  {dateTimeFormat.format(contact.createdAt)}
                </time>
              </InfoRow>
              <InfoRow label="Last updated">
                <time dateTime={contact.updatedAt.toISOString()}>
                  {dateTimeFormat.format(contact.updatedAt)}
                </time>
              </InfoRow>
              <InfoRow label="Source">{SOURCE_LABELS[contact.source] ?? contact.source}</InfoRow>
            </dl>
          </Card>

          <Card title="Danger zone">
            <div className="flex flex-col gap-3 p-5">
              <p className="text-sm text-zinc-500">
                Permanently delete this contact and remove them from all lists.
              </p>
              <ContactDeleteButton contactId={contact.id} label={name} />
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border bg-white">
      <h2 className="border-b px-5 py-3.5 font-semibold text-zinc-900">{title}</h2>
      {children}
    </section>
  );
}

function InfoRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-zinc-500">{label}</dt>
      <dd className="text-right font-medium text-zinc-900">{children}</dd>
    </div>
  );
}

function ContactSkeleton() {
  return (
    <>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-40" />
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <Skeleton className="h-72 rounded-xl lg:col-span-2" />
        <div className="flex flex-col gap-6">
          <Skeleton className="h-40 rounded-xl" />
          <Skeleton className="h-32 rounded-xl" />
        </div>
      </div>
    </>
  );
}
