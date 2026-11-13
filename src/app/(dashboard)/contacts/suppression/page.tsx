import { Suspense, type ReactNode } from "react";
import type { Metadata } from "next";
import { SearchX, ShieldBan } from "lucide-react";
import { PageContainer, PageHeader } from "@/components/dashboard/page-header";
import { AddSuppressionsDialog } from "@/components/contacts/suppression/add-suppressions-dialog";
import { ExportSuppressionsButton } from "@/components/contacts/suppression/export-button";
import { SuppressionExplainer } from "@/components/contacts/suppression/suppression-explainer";
import { SuppressionFilters } from "@/components/contacts/suppression/suppression-filters";
import { SuppressionPagination } from "@/components/contacts/suppression/suppression-pagination";
import { SuppressionTable, type SuppressionTableRow } from "@/components/contacts/suppression/suppression-table";
import { Skeleton } from "@/components/ui/skeleton";
import { countSuppressions, listSuppressions, SUPPRESSIONS_PAGE_SIZE } from "@/lib/suppression";
import { SUPPRESSION_REASONS, type SuppressionReasonValue } from "@/lib/suppression/meta";
import { requireActiveWorkspace } from "@/lib/workspace";

export const metadata: Metadata = { title: "Suppression list" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

// The frame (title + explainer) is static and shows instantly. Everything that
// depends on the logged-in user or the URL (?q=&reason=&page=) streams in
// inside <Suspense>, as Cache Components require.
export default function SuppressionPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <PageContainer>
      <Suspense fallback={<HeaderRow />}>
        <HeaderWithActions />
      </Suspense>

      <SuppressionExplainer />

      <Suspense fallback={<TableSkeleton />}>
        <SuppressionContent searchParams={searchParams} />
      </Suspense>
    </PageContainer>
  );
}

function HeaderRow({ actions }: { actions?: ReactNode }) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <PageHeader
        title="Suppression list"
        description="Addresses this workspace will never email, whether or not they're a contact."
      />
      {actions}
    </div>
  );
}

async function HeaderWithActions() {
  const ws = await requireActiveWorkspace();
  const canManage = ws.role === "OWNER" || ws.role === "ADMIN";
  if (!canManage) return <HeaderRow />;
  return (
    <HeaderRow
      actions={
        <div className="flex flex-wrap gap-2 self-start sm:self-auto">
          <ExportSuppressionsButton />
          <AddSuppressionsDialog />
        </div>
      }
    />
  );
}

/** Reads one search param as a plain string. */
function param(value: string | string[] | undefined): string {
  return typeof value === "string" ? value : "";
}

const dateFormat = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });

async function SuppressionContent({ searchParams }: { searchParams: SearchParams }) {
  const ws = await requireActiveWorkspace();
  const canManage = ws.role === "OWNER" || ws.role === "ADMIN";
  const sp = await searchParams;

  const q = param(sp.q).trim().slice(0, 200);
  const reasonParam = param(sp.reason).toUpperCase();
  const reason = (SUPPRESSION_REASONS as readonly string[]).includes(reasonParam)
    ? (reasonParam as SuppressionReasonValue)
    : undefined;
  const page = Number.parseInt(param(sp.page), 10) || 1;

  const [result, workspaceTotal] = await Promise.all([
    listSuppressions(ws.id, { q: q || undefined, reason, page }),
    countSuppressions(ws.id),
  ]);

  if (workspaceTotal === 0) {
    return (
      <div className="flex flex-col items-center rounded-2xl border border-dashed border-zinc-300 bg-white px-6 py-14 text-center">
        <span className="flex size-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
          <ShieldBan className="size-7" aria-hidden />
        </span>
        <h2 className="mt-5 text-lg font-semibold text-zinc-900">Nobody is suppressed yet</h2>
        <p className="mt-1.5 max-w-md text-sm text-zinc-500">
          Hard bounces and spam complaints will appear here automatically.
          {canManage && " You can also add addresses yourself, or upload another tool's unsubscribe export."}
        </p>
      </div>
    );
  }

  const query: Record<string, string> = {};
  if (q) query.q = q;
  if (reason) query.reason = reason.toLowerCase();

  const rows: SuppressionTableRow[] = result.rows.map((r) => ({
    id: r.id,
    email: r.email,
    reason: r.reason,
    note: r.note,
    addedLabel: dateFormat.format(r.createdAt),
    addedAt: r.createdAt.toISOString(),
    addedBy: r.addedBy,
  }));

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <SuppressionFilters q={q} reason={reason ?? ""} />
      {rows.length === 0 ? (
        <div className="flex flex-col items-center rounded-xl border bg-white px-6 py-12 text-center">
          <SearchX className="size-8 text-zinc-400" aria-hidden />
          <p className="mt-3 font-medium text-zinc-900">No addresses match these filters</p>
          <p className="mt-1 text-sm text-zinc-500">Try a different search, or clear the filters.</p>
        </div>
      ) : (
        <>
          <SuppressionTable rows={rows} canManage={canManage} />
          <SuppressionPagination
            page={result.page}
            pageCount={result.pageCount}
            total={result.total}
            pageSize={SUPPRESSIONS_PAGE_SIZE}
            query={query}
          />
        </>
      )}
    </div>
  );
}

function TableSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-hidden>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Skeleton className="h-8 w-full sm:w-72" />
        <Skeleton className="h-8 w-full sm:w-44" />
      </div>
      <div className="flex flex-col divide-y rounded-xl border bg-white">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="flex items-center gap-4 px-4 py-3">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-5 w-20 rounded-full" />
            <Skeleton className="ml-auto hidden h-4 w-24 sm:block" />
          </div>
        ))}
      </div>
    </div>
  );
}
