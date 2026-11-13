import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeftIcon, TagIcon } from "lucide-react";
import { PageContainer, PageHeader } from "@/components/dashboard/page-header";
import { fmt } from "@/components/statistics/chart-utils";
import { DateRangeControl } from "@/components/statistics/date-range-control";
import { DailyChart } from "@/components/transactional/daily-chart";
import { TRANSACTIONAL_STATUS_META } from "@/components/transactional/status";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { dayKey, formatDate, timeZoneLabel } from "@/lib/format-date";
import { parseStatsRange } from "@/lib/statistics/range";
import { getTransactionalStatsForRange } from "@/lib/transactional/queries";
import { getWorkspaceDatePrefs } from "@/lib/workspace-prefs";
import { requireActiveWorkspace } from "@/lib/workspace";

export const metadata: Metadata = { title: "Transactional statistics" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const TITLE = "Transactional statistics";
const DESCRIPTION = "How many emails your app sent through the API, and what happened to them.";

// Transactional → Statistics: totals by status and a daily chart for a date
// range (days in the workspace time zone). The frame is static; the numbers
// load inside <Suspense>.
export default function TransactionalStatisticsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <PageContainer>
      <Suspense fallback={<StatsSkeleton />}>
        <StatsContent searchParams={searchParams} />
      </Suspense>
    </PageContainer>
  );
}

async function StatsContent({ searchParams }: { searchParams: SearchParams }) {
  const ws = await requireActiveWorkspace();
  const [sp, prefs] = await Promise.all([searchParams, getWorkspaceDatePrefs(ws.id)]);
  const today = dayKey(new Date(), prefs.timezone);
  const range = parseStatsRange(sp, today);

  // Filtered by this workspace inside: other workspaces' emails never count.
  const stats = await getTransactionalStatsForRange(ws.id, range, prefs.timezone);
  const s = stats.byStatus;
  const delivered = s.SENT + s.BOUNCED + s.COMPLAINED; // accepted by the provider
  const pct = (n: number) => (stats.total ? `${((n / stats.total) * 100).toFixed(n / stats.total >= 0.1 || n === 0 ? 0 : 1)}%` : "—");

  const tiles = [
    { label: "Sent", value: s.SENT, hint: "Accepted by your provider", tone: "text-emerald-700" },
    { label: "Failed", value: s.FAILED, hint: "Couldn't be sent, even after retrying", tone: s.FAILED ? "text-red-600" : "text-zinc-900" },
    { label: "Suppressed", value: s.SUPPRESSED, hint: "Not sent: blocked addresses", tone: s.SUPPRESSED ? "text-violet-700" : "text-zinc-900" },
    { label: "Bounced", value: s.BOUNCED, hint: "Sent, then rejected by the inbox", tone: s.BOUNCED ? "text-orange-700" : "text-zinc-900" },
    { label: "Spam complaints", value: s.COMPLAINED, hint: "Marked as spam by the recipient", tone: s.COMPLAINED ? "text-red-600" : "text-zinc-900" },
    { label: "Queued or sending", value: s.QUEUED + s.SENDING, hint: "On the way right now", tone: "text-zinc-900" },
  ];

  return (
    <>
      <Header />
      <div className="flex flex-col gap-2">
        <DateRangeControl basePath="/transactional/statistics" range={range} today={today} />
        <p className="text-xs text-zinc-500">
          {formatDate(`${range.from}T12:00:00Z`, { ...prefs, timezone: "UTC" })} –{" "}
          {formatDate(`${range.to}T12:00:00Z`, { ...prefs, timezone: "UTC" })} ({range.days} day{range.days === 1 ? "" : "s"}),
          days in {timeZoneLabel(prefs.timezone)}. Each email counts on the day your app sent it, with its status now.
        </p>
      </div>

      <section aria-label="Totals for this period" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2 rounded-xl border bg-white px-4 py-4">
          <div>
            <p className="text-sm font-medium text-zinc-500">Emails in this period</p>
            <p className="mt-1 text-3xl font-semibold text-zinc-900 tabular-nums">{fmt(stats.total)}</p>
          </div>
          <p className="text-sm text-zinc-500">
            {fmt(delivered)} reached your provider ({pct(delivered)})
          </p>
        </div>
        <dl className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          {tiles.map((t) => (
            <div key={t.label} className="rounded-xl border bg-white px-4 py-3">
              <dt className="text-sm font-medium text-zinc-500">{t.label}</dt>
              <dd className="mt-1 flex items-baseline gap-1.5">
                <span className={`text-2xl font-semibold tabular-nums ${t.tone}`}>{fmt(t.value)}</span>
                <span className="text-xs text-zinc-500 tabular-nums">{pct(t.value)}</span>
              </dd>
              <dd className="mt-0.5 text-xs text-zinc-500">{t.hint}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section aria-labelledby="tx-daily-title" className="flex flex-col gap-4 rounded-xl border bg-white p-5">
        <h2 id="tx-daily-title" className="font-semibold text-zinc-900">
          Day by day
        </h2>
        <DailyChart daily={stats.daily} zoneLabel={prefs.timezone} />
        {stats.topTags.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 border-t pt-4">
            <span className="mr-1 flex items-center gap-1 text-xs font-medium text-zinc-500">
              <TagIcon className="size-3.5" aria-hidden />
              Top tags
            </span>
            {stats.topTags.map((t) => (
              <Link
                key={t.tag}
                href={`/transactional?tag=${encodeURIComponent(t.tag)}`}
                className="rounded-md bg-zinc-100 px-2 py-0.5 font-mono text-xs text-zinc-700 hover:bg-emerald-50 hover:text-emerald-800"
              >
                {t.tag} <span className="text-zinc-400">{fmt(t.count)}</span>
              </Link>
            ))}
          </div>
        )}
      </section>

      <details className="rounded-xl border bg-white p-5 text-sm">
        <summary className="cursor-pointer font-medium text-zinc-900">What do the statuses mean?</summary>
        <dl className="mt-3 grid gap-2">
          {(["SENT", "FAILED", "SUPPRESSED", "BOUNCED", "COMPLAINED", "QUEUED", "SENDING"] as const).map((key) => (
            <div key={key} className="grid gap-0.5 sm:grid-cols-[8rem_1fr] sm:gap-3">
              <dt className="font-medium text-zinc-900">{TRANSACTIONAL_STATUS_META[key].label}</dt>
              <dd className="text-zinc-600">{TRANSACTIONAL_STATUS_META[key].meaning}</dd>
            </div>
          ))}
        </dl>
      </details>
    </>
  );
}

function Header() {
  return (
    <PageHeader
      title={TITLE}
      description={DESCRIPTION}
      actions={
        <Link href="/transactional" className={buttonVariants({ variant: "outline" })}>
          <ArrowLeftIcon aria-hidden />
          Back to logs
        </Link>
      }
    />
  );
}

function StatsSkeleton() {
  return (
    <>
      <Header />
      <Skeleton className="h-8 w-full sm:w-44" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-56 rounded-xl" />
    </>
  );
}
