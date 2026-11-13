"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { KeyRoundIcon, Loader2, MonitorIcon } from "lucide-react";
import { loadMoreEmailsAction } from "@/app/actions/transactional";
import { RelativeTime } from "@/components/campaigns/local-time";
import { TransactionalStatusBadge } from "@/components/transactional/status-badge";
import type { EmailRowView, LogFilters } from "@/components/transactional/types";
import { Button } from "@/components/ui/button";

/**
 * The logs list. The server renders the first page; "Load more" fetches the
 * next one with the cursor and appends it. The page gives this component a
 * new `key` whenever the filters change, so it starts over from page one.
 */
export function EmailLogList({
  initialRows,
  initialCursor,
  filters,
}: {
  initialRows: EmailRowView[];
  initialCursor: string | null;
  filters: LogFilters;
}) {
  const [rows, setRows] = useState(initialRows);
  const [cursor, setCursor] = useState(initialCursor);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // A refresh from the server (e.g. after a test send) brings a new first page:
  // start over from it.
  const [prevInitial, setPrevInitial] = useState(initialRows);
  if (prevInitial !== initialRows) {
    setPrevInitial(initialRows);
    setRows(initialRows);
    setCursor(initialCursor);
  }

  function loadMore() {
    if (!cursor) return;
    setError(null);
    startTransition(async () => {
      try {
        const result = await loadMoreEmailsAction(filters, cursor);
        if (!result.ok) return setError(result.error);
        // Skip any row we already show (an email can't appear twice).
        setRows((current) => {
          const seen = new Set(current.map((r) => r.id));
          return [...current, ...result.rows.filter((r) => !seen.has(r.id))];
        });
        setCursor(result.nextCursor);
      } catch {
        setError("Couldn't reach the server. Please try again.");
      }
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <ul className="divide-y overflow-hidden rounded-xl border bg-white">
        {rows.map((row) => (
          <EmailRow key={row.id} row={row} />
        ))}
      </ul>

      <div className="flex flex-col items-center gap-2">
        {cursor ? (
          <Button variant="outline" onClick={loadMore} disabled={pending}>
            {pending && <Loader2 className="animate-spin" aria-hidden />}
            Load more
          </Button>
        ) : (
          rows.length > 10 && <p className="text-xs text-zinc-400">That&apos;s everything.</p>
        )}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}

function EmailRow({ row }: { row: EmailRowView }) {
  return (
    <li className="relative flex flex-col gap-2 px-4 py-3.5 transition-colors hover:bg-zinc-50/70 sm:flex-row sm:items-center sm:gap-5">
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <p className="min-w-0 truncate text-sm font-medium text-zinc-900">
            {/* The whole row is clickable: this link's ::after covers it. */}
            <Link href={`/transactional/${row.id}`} className="outline-none after:absolute after:inset-0 focus-visible:underline">
              {row.toName ? (
                <>
                  {row.toName} <span className="font-normal text-zinc-500">&lt;{row.toEmail}&gt;</span>
                </>
              ) : (
                row.toEmail
              )}
            </Link>
          </p>
          <TransactionalStatusBadge status={row.status} className="sm:hidden" />
        </div>
        <p className="mt-0.5 truncate text-sm text-zinc-600">{row.subject || <span className="italic text-zinc-400">No subject</span>}</p>
        {row.tags.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {row.tags.map((t) => (
              <span key={t} className="rounded-md bg-zinc-100 px-1.5 py-0.5 font-mono text-[11px] text-zinc-600">
                {t}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center gap-3 text-xs text-zinc-500 sm:w-[19rem] sm:shrink-0 sm:justify-end sm:gap-4">
        <span className="flex min-w-0 items-center gap-1" title={row.fromDashboard ? "Sent from the dashboard" : "API key"}>
          {row.fromDashboard ? <MonitorIcon className="size-3.5 shrink-0" aria-hidden /> : <KeyRoundIcon className="size-3.5 shrink-0" aria-hidden />}
          <span className="truncate">{row.fromDashboard ? "Dashboard test" : (row.keyName ?? "Deleted key")}</span>
        </span>
        <span className="shrink-0 whitespace-nowrap sm:w-24 sm:text-right">
          <RelativeTime iso={row.createdAt} />
        </span>
        <TransactionalStatusBadge status={row.status} className="hidden w-24 justify-center sm:inline-flex" />
      </div>
    </li>
  );
}
