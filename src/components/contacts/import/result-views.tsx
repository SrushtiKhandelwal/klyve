"use client";

import Link from "next/link";
import { AlertTriangle, CheckCircle2, Loader2, RotateCcw, Users } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import type { ImportProblem } from "@/lib/contacts/import";
import { cn } from "@/lib/utils";

export type ImportCounts = {
  created: number;
  updated: number;
  skipped: number;
  invalid: number;
};

/** Step 4 while running: a progress bar. */
export function ProgressView({ done, total }: { done: number; total: number }) {
  const percent = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;
  return (
    <div className="flex flex-col items-center gap-5 rounded-xl border bg-white px-6 py-12 text-center">
      <Loader2 className="size-8 animate-spin text-emerald-600" aria-hidden />
      <div>
        <p className="font-medium text-zinc-900">Importing your contacts…</p>
        <p className="mt-1 text-sm text-zinc-500">
          Please keep this page open until it&apos;s done.
        </p>
      </div>
      <div className="w-full max-w-md">
        <div
          role="progressbar"
          aria-label="Import progress"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          className="h-2.5 overflow-hidden rounded-full bg-zinc-100"
        >
          <div
            className="h-full rounded-full bg-emerald-500 transition-[width] duration-300"
            style={{ width: `${percent}%` }}
          />
        </div>
        <p className="mt-2 text-sm text-zinc-600 tabular-nums">
          {done.toLocaleString("en-US")} of {total.toLocaleString("en-US")} rows · {percent}%
        </p>
      </div>
    </div>
  );
}

/** Step 5: what happened. Also used (with `failure`) when the import stopped. */
export function SummaryView({
  counts,
  problems,
  listId,
  failure,
  onReset,
}: {
  counts: ImportCounts;
  problems: ImportProblem[];
  listId: string | null;
  /** Set when the import stopped early. */
  failure?: string;
  onReset: () => void;
}) {
  const contactsHref = listId ? `/contacts?list=${encodeURIComponent(listId)}` : "/contacts";
  // General problems (row = null) first, then by row number.
  const sorted = [...problems].sort((a, b) => (a.row ?? -1) - (b.row ?? -1));
  const rowProblems = sorted.filter((p) => p.row !== null);

  return (
    <div className="flex flex-col gap-5">
      {failure ? (
        <div role="alert" className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-red-600" aria-hidden />
          <div className="text-sm">
            <p className="font-medium text-red-800">The import stopped before it finished.</p>
            <p className="mt-0.5 text-red-700">{failure}</p>
            <p className="mt-1 text-red-700">
              The rows below were saved. You can safely import the same file again: contacts that
              already exist will be updated or skipped, not duplicated.
            </p>
          </div>
        </div>
      ) : (
        <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-600" aria-hidden />
          <p className="text-sm font-medium text-emerald-800">Import finished.</p>
        </div>
      )}

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Created" value={counts.created} tone="emerald" />
        <Stat label="Updated" value={counts.updated} />
        <Stat label="Skipped" value={counts.skipped} hint="already existed or on your suppression list" />
        <Stat label="Invalid" value={counts.invalid} tone={counts.invalid > 0 ? "red" : undefined} />
      </dl>

      {rowProblems.length > 0 && (
        <div className="rounded-xl border bg-white">
          <div className="border-b px-4 py-3">
            <h3 className="font-medium text-zinc-900">Rows we couldn&apos;t import</h3>
            <p className="text-sm text-zinc-500">
              {counts.invalid > rowProblems.length
                ? `Showing the first ${rowProblems.length} of ${counts.invalid.toLocaleString("en-US")}. `
                : ""}
              Row numbers match your spreadsheet (the header is row 1).
            </p>
          </div>
          <ul className="max-h-80 divide-y overflow-y-auto text-sm">
            {rowProblems.map((p, i) => (
              <li key={i} className="px-4 py-2 break-words">
                <span className="font-medium text-zinc-900">Row {p.row}:</span>{" "}
                <span className="text-zinc-600">{p.reason}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" size="lg" onClick={onReset}>
          <RotateCcw aria-hidden />
          Import another file
        </Button>
        <Link
          href={contactsHref}
          className={cn(buttonVariants({ size: "lg" }), "bg-emerald-600 text-white hover:bg-emerald-700")}
        >
          <Users aria-hidden />
          View contacts
        </Link>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: number;
  hint?: string;
  tone?: "emerald" | "red";
}) {
  return (
    <div className="rounded-xl border bg-white px-4 py-3">
      <dt className="text-sm text-zinc-500">
        {label}
        {hint && <span className="sr-only"> ({hint})</span>}
      </dt>
      <dd
        className={cn(
          "mt-1 text-2xl font-semibold tabular-nums",
          tone === "emerald" ? "text-emerald-700" : tone === "red" ? "text-red-600" : "text-zinc-900",
        )}
      >
        {value.toLocaleString("en-US")}
      </dd>
    </div>
  );
}
