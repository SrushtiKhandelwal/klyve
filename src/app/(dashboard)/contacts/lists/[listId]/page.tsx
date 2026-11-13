import { Suspense, type ReactNode } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowUpRight, SearchX, Users } from "lucide-react";
import { PageContainer } from "@/components/dashboard/page-header";
import { AddContactsDialog } from "@/components/contacts/lists/add-contacts-dialog";
import { formatCount, formatDate } from "@/components/contacts/lists/format";
import { ListActionsMenu } from "@/components/contacts/lists/list-actions-menu";
import { ListMembersTable, type MemberRow } from "@/components/contacts/lists/list-members-table";
import { PublicBadge } from "@/components/contacts/lists/lists-grid";
import { MembersPagination, MembersSearch } from "@/components/contacts/lists/members-search";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { contactDisplayName } from "@/lib/contacts/common";
import { getList, getListMembers, LIST_MEMBERS_PAGE_SIZE } from "@/lib/contacts/lists";
import { requireActiveWorkspace } from "@/lib/workspace";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "List" };

type Props = {
  params: Promise<{ listId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default function ListPage({ params, searchParams }: Props) {
  return (
    <PageContainer>
      <Link
        href="/contacts/lists"
        className="-mb-4 inline-flex w-fit items-center gap-1.5 text-sm font-medium text-zinc-500 hover:text-zinc-900"
      >
        <ArrowLeft className="size-4" aria-hidden />
        All lists
      </Link>
      {/* params, searchParams and the session are only known at request time,
          so everything that reads them streams in behind this boundary. */}
      <Suspense fallback={<ListDetailSkeleton />}>
        <ListDetail params={params} searchParams={searchParams} />
      </Suspense>
    </PageContainer>
  );
}

/** ?q=priya → "priya" (also handles ?q=a&q=b and missing values). */
function firstParam(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

async function ListDetail({ params, searchParams }: Props) {
  const ws = await requireActiveWorkspace();
  const { listId } = await params;
  const sp = await searchParams;

  const q = firstParam(sp.q).trim().slice(0, 200);
  const page = Number.parseInt(firstParam(sp.page), 10) || 1;

  // Both queries filter by ws.id, so a list id from another workspace finds
  // nothing and we show "not found", exactly as for an id that never existed.
  const [list, result] = await Promise.all([
    getList(ws.id, listId),
    getListMembers(ws.id, listId, { q, page }),
  ]);
  if (!list) notFound();

  // Send the browser plain, already-formatted values only.
  const rows: MemberRow[] = result.members.map((m) => {
    const name = contactDisplayName(m);
    return {
      id: m.id,
      email: m.email,
      name: name === m.email ? null : name,
      status: m.status,
      addedAt: formatDate(m.addedAt),
    };
  });

  const editable = {
    id: list.id,
    name: list.name,
    description: list.description,
    isPublic: list.isPublic,
    publicName: list.publicName,
    publicDescription: list.publicDescription,
  };

  return (
    <>
      <header className="flex flex-col gap-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 flex-col gap-1.5">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight break-words text-zinc-900 sm:text-3xl">
                {list.name}
              </h1>
              {list.isPublic && <PublicBadge />}
            </div>
            {list.description && (
              <p className="text-sm break-words whitespace-pre-line text-zinc-500 sm:text-base">
                {list.description}
              </p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <AddContactsDialog listId={list.id} listName={list.name} />
            <ListActionsMenu list={editable} totalMembers={list.totalMembers} onListPage />
          </div>
        </div>

        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Stat label="Members" value={formatCount(list.totalMembers)} />
          <Stat
            label="Subscribed"
            value={formatCount(list.subscribedMembers)}
            hint="Will receive campaigns"
            accent
          />
          <Stat label="Created" value={formatDate(list.createdAt)} className="col-span-2 sm:col-span-1" />
        </dl>
      </header>

      <section aria-labelledby="members-heading" className="min-w-0 rounded-xl border bg-white">
        <div className="flex flex-col gap-3 border-b px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center justify-between gap-3 sm:justify-start">
            <h2 id="members-heading" className="font-semibold text-zinc-900">
              Members
            </h2>
            <Link
              href={`/contacts?list=${list.id}`}
              className="inline-flex items-center gap-1 text-sm font-medium text-emerald-700 hover:underline"
            >
              View in All contacts
              <ArrowUpRight className="size-4" aria-hidden />
            </Link>
          </div>
          {list.totalMembers > 0 && <MembersSearch listId={list.id} q={q} />}
        </div>

        {rows.length > 0 ? (
          <>
            {/* key: start with nothing selected on every new page or search. */}
            <ListMembersTable
              key={`${q}:${result.page}`}
              listId={list.id}
              listName={list.name}
              members={rows}
            />
            <MembersPagination
              listId={list.id}
              q={q}
              page={result.page}
              pageCount={result.pageCount}
              total={result.total}
              pageSize={LIST_MEMBERS_PAGE_SIZE}
            />
          </>
        ) : q ? (
          <MembersEmpty
            icon={SearchX}
            title="No members match your search"
            description={`Nobody in this list has a name or email containing “${q}”.`}
          >
            <Link
              href={`/contacts/lists/${list.id}`}
              className={cn(buttonVariants({ variant: "outline" }), "mt-5")}
            >
              Clear search
            </Link>
          </MembersEmpty>
        ) : (
          <MembersEmpty
            icon={Users}
            title="This list is empty"
            description="Add contacts by pasting their email addresses, or import a CSV file into this list."
          >
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              <AddContactsDialog listId={list.id} listName={list.name} />
              <Link href="/contacts/import" className={buttonVariants({ variant: "outline" })}>
                Import a CSV
              </Link>
            </div>
          </MembersEmpty>
        )}
      </section>
    </>
  );
}

function Stat({
  label,
  value,
  hint,
  accent = false,
  className,
}: {
  label: string;
  value: string;
  hint?: string;
  accent?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border px-4 py-3",
        accent ? "border-emerald-100 bg-emerald-50/60" : "bg-white",
        className,
      )}
    >
      <dt className={cn("text-xs", accent ? "text-emerald-700" : "text-zinc-500")}>{label}</dt>
      <dd
        className={cn(
          "mt-0.5 text-lg font-semibold tabular-nums",
          accent ? "text-emerald-800" : "text-zinc-900",
        )}
      >
        {value}
      </dd>
      {hint && <dd className="text-xs text-emerald-700/80">{hint}</dd>}
    </div>
  );
}

function MembersEmpty({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: typeof Users;
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      <span className="flex size-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
        <Icon className="size-6" aria-hidden />
      </span>
      <h3 className="mt-4 font-semibold text-zinc-900">{title}</h3>
      <p className="mt-1 max-w-sm text-sm break-words text-zinc-500">{description}</p>
      {children}
    </div>
  );
}

function ListDetailSkeleton() {
  return (
    <div className="flex flex-col gap-8" aria-hidden>
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-4 w-72 max-w-full" />
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Skeleton className="h-16 rounded-xl" />
          <Skeleton className="h-16 rounded-xl" />
          <Skeleton className="col-span-2 h-16 rounded-xl sm:col-span-1" />
        </div>
      </div>
      <div className="rounded-xl border bg-white">
        <div className="border-b px-4 py-3">
          <Skeleton className="h-5 w-24" />
        </div>
        {[1, 2, 3, 4, 5].map((n) => (
          <div key={n} className="flex items-center gap-4 border-b px-4 py-3 last:border-0">
            <Skeleton className="size-4 rounded" />
            <Skeleton className="h-4 w-40" />
            <Skeleton className="ml-auto h-5 w-20 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
