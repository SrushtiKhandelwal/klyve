"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2, Search, SearchX } from "lucide-react";
import { listCampaignRecipientsAction } from "@/app/actions/campaigns";
import { RecipientStatusBadge } from "@/components/campaigns/campaign-status-badge";
import { LocalDateTime } from "@/components/campaigns/local-time";
import { formatCount } from "@/components/campaigns/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RECIPIENT_STATUSES, RECIPIENT_STATUS_META, type RecipientStatusValue } from "@/lib/campaigns/status";
import { cn } from "@/lib/utils";

type Row = { id: string; email: string; status: RecipientStatusValue; attempts: number; lastError: string | null; sentAt: string | null };
type PageData = { rows: Row[]; total: number; page: number; pageCount: number };
type Query = { status: RecipientStatusValue | ""; q: string; page: number };

const PAGE_SIZE = 50;

/**
 * Who the campaign went to, 50 at a time: filter by status, search by email,
 * and see why a failed email failed. Loads through a Server Action (not the
 * URL), so the live progress above keeps running while you browse.
 */
export function RecipientsTable({
  campaignId,
  counts,
  total,
  refreshKey,
}: {
  campaignId: string;
  counts: Record<RecipientStatusValue, number>;
  total: number;
  /** Changes when the progress numbers change, so the rows stay fresh. */
  refreshKey: string;
}) {
  const [query, setQuery] = useState<Query>({ status: "", q: "", page: 1 });
  const [search, setSearch] = useState("");
  const [data, setData] = useState<PageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  useEffect(() => {
    let cancelled = false;
    // Starts in a microtask so the "loading" state isn't set synchronously inside the effect.
    void Promise.resolve().then(async () => {
      if (cancelled) return;
      setLoading(true);
      try {
        const res = await listCampaignRecipientsAction(campaignId, {
          status: query.status || undefined,
          q: query.q || undefined,
          page: query.page,
        });
        if (cancelled) return;
        if (!res.ok) {
          setError(res.error);
        } else {
          setError(null);
          setData({
            ...res.page,
            rows: res.page.rows.map((r) => ({
              ...r,
              status: r.status as RecipientStatusValue,
              sentAt: r.sentAt ? new Date(r.sentAt).toISOString() : null,
            })),
          });
        }
      } catch {
        if (!cancelled) setError("Couldn't load the recipients. Check your connection.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [campaignId, query, refreshKey]);

  function onSearchChange(value: string) {
    setSearch(value);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setQuery((q) => ({ ...q, q: value.trim(), page: 1 })), 350);
  }

  const filters: { value: RecipientStatusValue | ""; label: string; count: number }[] = [
    { value: "", label: "All", count: total },
    ...RECIPIENT_STATUSES.filter((s) => s !== "SENDING").map((s) => ({
      value: s,
      label: RECIPIENT_STATUS_META[s].label,
      // "Queued" also counts the few being handed to the provider right now.
      count: s === "PENDING" ? counts.PENDING + counts.SENDING : counts[s],
    })),
  ];

  const from = data && data.total > 0 ? (data.page - 1) * PAGE_SIZE + 1 : 0;
  const to = data ? Math.min(data.page * PAGE_SIZE, data.total) : 0;

  return (
    <section aria-labelledby="recipients-title" className="flex flex-col gap-4 rounded-xl border bg-white p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 id="recipients-title" className="flex items-center gap-2 font-semibold text-zinc-900">
          Recipients
          {loading && <Loader2 className="size-4 animate-spin text-zinc-400" aria-label="Loading" />}
        </h2>
        <form
          role="search"
          className="relative w-full sm:w-64"
          onSubmit={(e) => {
            e.preventDefault();
            if (timer.current) clearTimeout(timer.current);
            setQuery((q) => ({ ...q, q: search.trim(), page: 1 }));
          }}
        >
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-zinc-400" aria-hidden />
          <Input
            type="search"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search by email"
            aria-label="Search recipients by email"
            maxLength={100}
            className="pl-8"
          />
        </form>
      </div>

      {/* Status chips scroll sideways on phones instead of wrapping into many rows. */}
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0" role="group" aria-label="Filter by status">
        {filters.map((f) => {
          const active = query.status === f.value;
          return (
            <button
              key={f.value || "all"}
              type="button"
              aria-pressed={active}
              onClick={() => setQuery((q) => ({ ...q, status: f.value, page: 1 }))}
              className={cn(
                "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-3 focus-visible:ring-emerald-500/40",
                active ? "border-emerald-600 bg-emerald-600 text-white" : "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300",
              )}
            >
              {f.label}
              <span className={cn("rounded-full px-1.5 text-xs tabular-nums", active ? "bg-white/20" : "bg-zinc-100")}>{formatCount(f.count)}</span>
            </button>
          );
        })}
      </div>

      {error ? (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : !data ? (
        <div className="flex flex-col divide-y rounded-lg border">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="h-12 animate-pulse bg-zinc-50" />
          ))}
        </div>
      ) : data.rows.length === 0 ? (
        <div className="flex flex-col items-center rounded-lg border px-6 py-10 text-center">
          <SearchX className="size-7 text-zinc-400" aria-hidden />
          <p className="mt-2 text-sm font-medium text-zinc-900">Nobody here</p>
          <p className="mt-0.5 text-sm text-zinc-500">No recipients match this filter or search.</p>
        </div>
      ) : (
        <ul className={cn("divide-y rounded-lg border transition-opacity", loading && "opacity-60")}>
          {data.rows.map((r) => (
            <li key={r.id} className="flex flex-col gap-1 px-3 py-2.5 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-4">
              <span className="min-w-0 flex-1 text-sm break-all text-zinc-900">{r.email}</span>
              <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500">
                {r.status === "SENT" && r.sentAt && <LocalDateTime iso={r.sentAt} />}
                {r.attempts > 1 && <span>{r.attempts} tries</span>}
                <RecipientStatusBadge status={r.status} />
              </span>
              {r.lastError && (r.status === "FAILED" || r.status === "SKIPPED" || r.status === "PENDING") && (
                <p
                  className={cn(
                    "text-xs break-words sm:basis-full",
                    r.status === "FAILED" ? "text-red-700" : "text-zinc-500",
                  )}
                >
                  {r.status === "PENDING" ? "Will retry: " : ""}
                  {r.lastError}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}

      {data && data.total > 0 && (
        <nav aria-label="Recipients pages" className="flex flex-col gap-3 text-sm text-zinc-500 sm:flex-row sm:items-center sm:justify-between">
          <p>
            Showing <span className="font-medium text-zinc-900">{formatCount(from)}</span>–
            <span className="font-medium text-zinc-900">{formatCount(to)}</span> of{" "}
            <span className="font-medium text-zinc-900">{formatCount(data.total)}</span>
          </p>
          {data.pageCount > 1 && (
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" disabled={data.page <= 1 || loading} onClick={() => setQuery((q) => ({ ...q, page: data.page - 1 }))}>
                <ChevronLeft aria-hidden />
                Previous
              </Button>
              <span className="px-1 tabular-nums">
                Page {data.page} of {data.pageCount}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={data.page >= data.pageCount || loading}
                onClick={() => setQuery((q) => ({ ...q, page: data.page + 1 }))}
              >
                Next
                <ChevronRight aria-hidden />
              </Button>
            </div>
          )}
        </nav>
      )}
    </section>
  );
}
