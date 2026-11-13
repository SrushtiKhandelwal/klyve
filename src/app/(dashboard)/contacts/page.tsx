import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { SearchX, Upload, Users } from "lucide-react";
import { Glyph } from "@/components/brand/glyph";
import { PageContainer, PageHeader } from "@/components/dashboard/page-header";
import { ContactCreateDialog } from "@/components/contacts/contact-create-dialog";
import { ContactsTable, type ContactsTableRow } from "@/components/contacts/contacts-table";
import { ContactsTableFilters } from "@/components/contacts/contacts-table-filters";
import { ContactsTablePagination } from "@/components/contacts/contacts-table-pagination";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getEngagementForContacts } from "@/lib/contacts/activity";
import { getAttributeDefinitions, getListOptions } from "@/lib/contacts/lookups";
import {
  CONTACTS_PAGE_SIZE,
  countContacts,
  listContacts,
  parseContactFilters,
} from "@/lib/contacts/queries";
import { requireActiveWorkspace } from "@/lib/workspace";

export const metadata: Metadata = { title: "Contacts" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

// The page itself is static. Everything that depends on the user or on the
// URL (?q=&status=&list=&page=) lives in <ContactsContent />, inside Suspense,
// so the frame shows instantly and the data streams in.
export default function ContactsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <PageContainer>
      <Suspense fallback={<ContactsSkeleton />}>
        <ContactsContent searchParams={searchParams} />
      </Suspense>
    </PageContainer>
  );
}

// "11 Nov 2026": day first and month as a word, so nobody misreads it.
const dateFormat = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

async function ContactsContent({ searchParams }: { searchParams: SearchParams }) {
  // Checks login + workspace right next to the data (see ../layout.tsx).
  const ws = await requireActiveWorkspace();
  const filters = parseContactFilters(await searchParams);

  const [result, workspaceTotal, lists, attributes] = await Promise.all([
    listContacts(ws.id, filters),
    countContacts(ws.id),
    getListOptions(ws.id),
    getAttributeDefinitions(ws.id),
  ]);

  const header = (
    <PageHeader
      title={
        <>
          Contacts
          {/* The total as quiet grey text next to the title (no pill). */}
          <span className="ml-2.5 font-normal tracking-normal text-zinc-400 tabular-nums">
            {workspaceTotal.toLocaleString("en")}
          </span>
        </>
      }
      description="Everyone you can send email to."
      actions={workspaceTotal > 0 && <ContactCreateDialog lists={lists} attributes={attributes} />}
    />
  );

  // Brand-new workspace: no table, just a friendly way to get started.
  if (workspaceTotal === 0) {
    return (
      <>
        {header}
        <div className="flex flex-col items-center rounded-2xl border border-dashed border-zinc-300 bg-white px-6 py-14 text-center sm:py-20">
          <Glyph icon={Users} size="xl" strokeWidth={1.5} className="size-10" />
          <h2 className="mt-5 text-lg font-semibold text-zinc-900">No contacts yet</h2>
          <p className="mt-1.5 max-w-md text-sm text-zinc-500">
            Import a CSV from your spreadsheet or CRM, or add people one at a time.
          </p>
          <div className="mt-6 flex flex-col gap-2 sm:flex-row">
            <Link href="/contacts/import" className={buttonVariants()}>
              <Upload aria-hidden />
              Import contacts
            </Link>
            <ContactCreateDialog lists={lists} attributes={attributes} variant="outline" />
          </div>
        </div>
      </>
    );
  }

  // The filters as they should appear in links (Previous/Next keep them).
  const query: Record<string, string> = {};
  if (filters.q) query.q = filters.q;
  if (filters.status) query.status = filters.status.toLowerCase();
  if (filters.listId) query.list = filters.listId;

  // Engagement badges for this page only: one aggregate query.
  const engagement = await getEngagementForContacts(
    ws.id,
    result.contacts.map((c) => c.id),
  );

  const rows: ContactsTableRow[] = result.contacts.map((c) => {
    const activity = engagement.get(c.id);
    return {
      id: c.id,
      // null when no name is saved; the table then shows "No name".
      name: [c.firstName, c.lastName].filter(Boolean).join(" ").trim() || null,
      email: c.email,
      status: c.status,
      listCount: c.listCount,
      addedAt: c.createdAt.toISOString(),
      addedLabel: dateFormat.format(c.createdAt),
      // Contacts never sent a campaign have no row in the map.
      engagement: activity?.badge ?? "NOT_EMAILED",
      lastActivityLabel: activity?.lastActivityAt ? dateFormat.format(activity.lastActivityAt) : null,
    };
  });

  return (
    <>
      {header}
      <div className="flex min-w-0 flex-col gap-4">
        <ContactsTableFilters
          q={filters.q ?? ""}
          status={filters.status ?? ""}
          listId={filters.listId ?? ""}
          lists={lists}
        />

        {rows.length === 0 ? (
          <div className="flex flex-col items-center rounded-xl border bg-white px-6 py-12 text-center">
            <SearchX className="size-8 text-zinc-400" aria-hidden />
            <p className="mt-3 font-medium text-zinc-900">No contacts match these filters</p>
            <p className="mt-1 text-sm text-zinc-500">Try a different search, or clear the filters.</p>
          </div>
        ) : (
          <>
            {/* A new key per page/filter clears any ticked checkboxes. */}
            <ContactsTable
              key={`${JSON.stringify(query)}:${result.page}`}
              rows={rows}
              lists={lists}
            />
            <ContactsTablePagination
              page={result.page}
              pageCount={result.pageCount}
              total={result.total}
              pageSize={CONTACTS_PAGE_SIZE}
              query={query}
            />
          </>
        )}
      </div>
    </>
  );
}

function ContactsSkeleton() {
  return (
    <>
      <PageHeader
        title={
          <>
            Contacts
            <Skeleton className="ml-3 inline-block h-6 w-10 rounded-full align-middle" />
          </>
        }
        description="Everyone you can send email to."
      />
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2 sm:flex-row">
          <Skeleton className="h-8 w-full sm:w-72" />
          <Skeleton className="h-8 w-full sm:w-40" />
          <Skeleton className="h-8 w-full sm:w-44" />
        </div>
        <div className="flex flex-col divide-y rounded-xl border bg-white">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="flex items-center gap-4 px-4 py-3">
              <Skeleton className="size-4" />
              <Skeleton className="h-4 w-32" />
              <Skeleton className="hidden h-4 w-48 sm:block" />
              <Skeleton className="ml-auto h-5 w-20 rounded-full" />
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
