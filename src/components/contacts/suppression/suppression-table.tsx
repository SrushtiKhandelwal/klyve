import { Lock } from "lucide-react";
import type { SuppressionReasonValue } from "@/lib/suppression/meta";
import { RemoveSuppressionButton } from "./remove-suppression-button";
import { SuppressionReasonBadge } from "./suppression-reason-badge";

export type SuppressionTableRow = {
  id: string;
  /** null = an erased person (only a hash is kept). */
  email: string | null;
  reason: SuppressionReasonValue;
  note: string | null;
  addedLabel: string;
  addedAt: string;
  /** null = added automatically (bounce/complaint) or by a user who's gone. */
  addedBy: string | null;
};

/**
 * The suppression list. A real table from the "sm" breakpoint up; on phones
 * each row becomes a small stacked card (5 columns don't fit 375px).
 */
export function SuppressionTable({ rows, canManage }: { rows: SuppressionTableRow[]; canManage: boolean }) {
  return (
    <div className="overflow-hidden rounded-xl border bg-white">
      <table className="w-full text-sm">
        <thead className="hidden border-b bg-zinc-50/80 text-left text-xs text-zinc-500 sm:table-header-group">
          <tr>
            <th scope="col" className="px-4 py-2.5 font-medium">
              Email
            </th>
            <th scope="col" className="px-4 py-2.5 font-medium">
              Reason
            </th>
            <th scope="col" className="hidden px-4 py-2.5 font-medium md:table-cell">
              Note
            </th>
            <th scope="col" className="px-4 py-2.5 font-medium">
              Added
            </th>
            {canManage && (
              <th scope="col" className="w-12 px-4 py-2.5">
                <span className="sr-only">Actions</span>
              </th>
            )}
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((row) => (
            <tr key={row.id} className="flex flex-col gap-1.5 px-4 py-3 sm:table-row sm:p-0">
              <td className="min-w-0 sm:px-4 sm:py-3">
                <div className="flex items-start justify-between gap-2">
                  {row.email ? (
                    <span className="font-medium break-all text-zinc-900">{row.email}</span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-zinc-500 italic">
                      <Lock className="size-3.5 shrink-0" aria-hidden />
                      Erased contact (hashed)
                    </span>
                  )}
                  {/* On phones the remove button sits next to the address. */}
                  {canManage && (
                    <span className="-my-1 sm:hidden">
                      <RemoveSuppressionButton row={row} />
                    </span>
                  )}
                </div>
              </td>
              <td className="sm:px-4 sm:py-3">
                <SuppressionReasonBadge reason={row.reason} />
              </td>
              {/* Phones show the note under the badge; tablets hide it; desktops give it a column. */}
              <td className="text-zinc-600 empty:hidden sm:hidden md:table-cell md:max-w-xs md:px-4 md:py-3">
                {row.note ? (
                  <span className="line-clamp-2 break-words" title={row.note}>
                    {row.note}
                  </span>
                ) : null}
              </td>
              <td className="text-xs text-zinc-500 sm:px-4 sm:py-3 sm:text-sm">
                <time dateTime={row.addedAt} className="whitespace-nowrap">
                  {row.addedLabel}
                </time>
                <span className="ml-1 text-xs text-zinc-400 sm:ml-0 sm:block">
                  {row.addedBy ? `by ${row.addedBy}` : "automatically"}
                </span>
              </td>
              {canManage && (
                <td className="hidden sm:table-cell sm:px-4 sm:py-3 sm:text-right">
                  <RemoveSuppressionButton row={row} />
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
