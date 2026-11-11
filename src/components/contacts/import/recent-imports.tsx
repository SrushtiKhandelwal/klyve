import { FileText } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { getRecentImports, type RecentImport } from "@/lib/contacts/import";
import { requireActiveWorkspace } from "@/lib/workspace";
import { cn } from "@/lib/utils";
import { LocalDateTime } from "./local-date-time";

// "Recent imports" under the wizard: the workspace's last 10 imports.
// A Server Component that checks the workspace itself, so it must be
// rendered inside <Suspense> (it reads the session cookie).

const STATUS_META: Record<RecentImport["status"], { label: string; className: string }> = {
  PROCESSING: { label: "Processing", className: "bg-sky-50 text-sky-700 ring-sky-600/20" },
  COMPLETED: { label: "Completed", className: "bg-emerald-50 text-emerald-700 ring-emerald-600/20" },
  FAILED: { label: "Failed", className: "bg-red-50 text-red-700 ring-red-600/20" },
  INTERRUPTED: { label: "Interrupted", className: "bg-zinc-100 text-zinc-600 ring-zinc-500/20" },
};

export async function RecentImports() {
  const ws = await requireActiveWorkspace();
  const imports = await getRecentImports(ws.id);

  if (imports.length === 0) {
    return <p className="px-5 py-8 text-center text-sm text-zinc-500">No imports yet.</p>;
  }

  return (
    <ul className="divide-y">
      {imports.map((imp) => {
        const status = STATUS_META[imp.status];
        return (
          <li key={imp.id} className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-center sm:gap-4">
            <div className="flex min-w-0 flex-1 items-start gap-3">
              <FileText className="mt-0.5 size-5 shrink-0 text-zinc-400" aria-hidden />
              <div className="min-w-0">
                <p className="truncate font-medium text-zinc-900" title={imp.fileName}>
                  {imp.fileName}
                </p>
                <p className="text-sm text-zinc-500">
                  <LocalDateTime iso={imp.createdAt.toISOString()} />
                  {" · "}
                  {imp.totalRows.toLocaleString("en-US")} {imp.totalRows === 1 ? "row" : "rows"}
                  {imp.listName && <> · list “{imp.listName}”</>}
                </p>
                {imp.failureReason && <p className="mt-0.5 text-sm text-red-600">{imp.failureReason}</p>}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pl-8 text-sm text-zinc-600 tabular-nums sm:pl-0">
              <span>
                <span className="font-medium text-zinc-900">{imp.created.toLocaleString("en-US")}</span> created
              </span>
              <span>
                <span className="font-medium text-zinc-900">{imp.updated.toLocaleString("en-US")}</span> updated
              </span>
              <span>
                <span className="font-medium text-zinc-900">{imp.skipped.toLocaleString("en-US")}</span> skipped
              </span>
              {imp.invalid !== null && (
                <span>
                  <span className={cn("font-medium", imp.invalid > 0 ? "text-red-600" : "text-zinc-900")}>
                    {imp.invalid.toLocaleString("en-US")}
                  </span>{" "}
                  invalid
                </span>
              )}
              <span
                className={cn(
                  "inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset",
                  status.className,
                )}
              >
                {status.label}
              </span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function RecentImportsSkeleton() {
  return (
    <div className="divide-y">
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex items-center gap-3 px-5 py-4">
          <Skeleton className="size-5 rounded" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-56" />
          </div>
          <Skeleton className="hidden h-4 w-48 sm:block" />
        </div>
      ))}
    </div>
  );
}
