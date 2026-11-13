import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageContainer, PageHeader } from "@/components/dashboard/page-header";
import { fmt } from "@/components/statistics/chart-utils";
import { DateRangeControl } from "@/components/statistics/date-range-control";
import { ExportMenu } from "@/components/statistics/export-menu";
import { MarketingChart } from "@/components/statistics/marketing-chart";
import { Skeleton } from "@/components/ui/skeleton";
import { dayKey, formatDate, timeZoneLabel, type DatePrefs } from "@/lib/format-date";
import { getMarketingStatistics, type MarketingStatistics } from "@/lib/statistics/marketing";
import { parseIncludeAutomation, parseStatsRange, rangeSearch } from "@/lib/statistics/range";
import { OPENS_DISCLAIMER } from "@/lib/tracking/metrics";
import { getWorkspaceDatePrefs } from "@/lib/workspace-prefs";
import { requireActiveWorkspace } from "@/lib/workspace";

export const metadata: Metadata = { title: "Statistics" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const TITLE = "Statistics";
const DESCRIPTION = "How your email marketing performed over time, across all your campaigns.";

// Statistics (like Brevo's Marketing → Statistics). The frame is static;
// everything that depends on the user or the URL (?range=…) loads inside
// <Suspense>, so the frame shows instantly.
export default function StatisticsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <PageContainer>
      <Suspense fallback={<StatisticsSkeleton />}>
        <StatisticsContent searchParams={searchParams} />
      </Suspense>
    </PageContainer>
  );
}

async function StatisticsContent({ searchParams }: { searchParams: SearchParams }) {
  const ws = await requireActiveWorkspace();
  const [sp, prefs] = await Promise.all([searchParams, getWorkspaceDatePrefs(ws.id)]);
  const today = dayKey(new Date(), prefs.timezone);
  const range = parseStatsRange(sp, today);
  const includeAutomation = parseIncludeAutomation(sp);

  // Every query inside is filtered by this workspace.
  const stats = await getMarketingStatistics(ws.id, range, { timezone: prefs.timezone, includeAutomation });
  const search = rangeSearch(range, includeAutomation);

  return (
    <>
      <PageHeader title={TITLE} description={DESCRIPTION} actions={<ExportMenu search={search} />} />

      <div className="flex flex-col gap-2">
        <DateRangeControl basePath="/statistics" range={range} today={today} includeAutomation={includeAutomation} />
        <p className="text-xs text-zinc-500">
          {formatDate(`${range.from}T12:00:00Z`, { ...prefs, timezone: "UTC" })} –{" "}
          {formatDate(`${range.to}T12:00:00Z`, { ...prefs, timezone: "UTC" })} ({range.days} day{range.days === 1 ? "" : "s"}),
          days in {timeZoneLabel(prefs.timezone)}. {includeAutomation ? "Automation emails included." : "Campaigns only."}
        </p>
      </div>

      <Summary stats={stats} />

      <section aria-labelledby="daily-title" className="flex flex-col gap-4 rounded-xl border bg-white p-5">
        <div className="flex flex-col gap-0.5">
          <h2 id="daily-title" className="font-semibold text-zinc-900">
            Day by day
          </h2>
          <p className="text-sm text-zinc-500">Unique opens and clicks count each person once per day.</p>
        </div>
        <MarketingChart daily={stats.daily} zoneLabel={prefs.timezone} />
      </section>

      <CampaignTable stats={stats} prefs={prefs} />
    </>
  );
}

// ── Summary tiles ────────────────────────────────────────────────────────────

function Summary({ stats }: { stats: MarketingStatistics }) {
  const t = stats.totals;
  const headline = [
    { label: "Emails sent", value: fmt(t.sent), hint: `${fmt(t.delivered)} delivered (sent minus bounces)` },
    { label: "Recipients", value: fmt(t.recipients), hint: "Different people emailed" },
    { label: "Open rate", value: t.openRate, hint: `${fmt(t.uniqueOpens)} unique open${t.uniqueOpens === 1 ? "" : "s"}` },
    { label: "Click rate", value: t.clickRate, hint: `${fmt(t.uniqueClicks)} unique click${t.uniqueClicks === 1 ? "" : "s"}` },
  ];
  const health = [
    { label: "Unsubscribes", value: fmt(t.unsubscribes), rate: t.unsubscribeRate, warn: false },
    {
      label: "Bounces",
      value: fmt(t.bounces),
      rate: t.bounceRate,
      warn: false,
      extra: t.softBounces ? `+ ${fmt(t.softBounces)} temporary (not counted)` : null,
    },
    { label: "Spam complaints", value: fmt(t.complaints), rate: t.complaintRate, warn: t.complaints > 0 },
  ];

  return (
    <section aria-label="Totals for this period" className="flex flex-col gap-3">
      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {headline.map((c) => (
          <div key={c.label} className="rounded-xl border bg-white px-4 py-4">
            <dt className="text-sm font-medium text-zinc-500">{c.label}</dt>
            <dd className="mt-1 text-2xl font-semibold text-zinc-900 tabular-nums sm:text-3xl">{c.value}</dd>
            <dd className="mt-0.5 text-xs text-zinc-500">{c.hint}</dd>
          </div>
        ))}
      </dl>
      <dl className="grid gap-3 sm:grid-cols-3">
        {health.map((c) => (
          <div key={c.label} className="flex items-baseline justify-between gap-3 rounded-xl border bg-white px-4 py-3">
            <div className="min-w-0">
              <dt className="text-sm font-medium text-zinc-500">{c.label}</dt>
              {c.extra && <dd className="text-xs text-zinc-500">{c.extra}</dd>}
            </div>
            <dd className="text-right">
              <span className={`text-lg font-semibold tabular-nums ${c.warn ? "text-red-600" : "text-zinc-900"}`}>{c.value}</span>
              <span className="ml-1.5 text-xs text-zinc-500 tabular-nums">{c.rate}</span>
            </dd>
          </div>
        ))}
      </dl>
      <p className="text-xs text-zinc-500">
        Rates compare what happened in this period with the emails sent in it. Automated opens and clicks (like
        Apple Mail&apos;s privacy protection or security scanners) are not counted. {OPENS_DISCLAIMER}
      </p>
    </section>
  );
}

// ── Campaigns sent in the period ─────────────────────────────────────────────

function CampaignTable({ stats, prefs }: { stats: MarketingStatistics; prefs: DatePrefs }) {
  return (
    <section aria-labelledby="campaigns-title" className="flex flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <h2 id="campaigns-title" className="font-semibold text-zinc-900">
          Campaigns sent in this period
        </h2>
        <p className="text-sm text-zinc-500">
          The numbers are each campaign&apos;s totals so far. Click a name for its full report.
        </p>
      </div>

      {stats.campaigns.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-white px-6 py-10 text-center">
          <p className="font-medium text-zinc-900">No emails went out in this period</p>
          <p className="mt-1 text-sm text-zinc-500">
            Pick a longer date range, or{" "}
            <Link href="/campaigns/new" className="font-medium text-emerald-700 hover:underline">
              create a campaign
            </Link>
            .
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-white">
          <table className="w-full min-w-[44rem] text-left text-sm">
            <thead className="border-b bg-zinc-50 text-xs text-zinc-500">
              <tr>
                <th scope="col" className="px-4 py-2.5 font-medium">
                  Campaign
                </th>
                <th scope="col" className="px-3 py-2.5 font-medium">
                  Started
                </th>
                <th scope="col" className="px-3 py-2.5 text-right font-medium">
                  Sent in period
                </th>
                <th scope="col" className="px-3 py-2.5 text-right font-medium">
                  Open rate
                </th>
                <th scope="col" className="px-3 py-2.5 text-right font-medium">
                  Click rate
                </th>
                <th scope="col" className="px-3 py-2.5 text-right font-medium">
                  Unsubscribes
                </th>
                <th scope="col" className="px-4 py-2.5 text-right font-medium">
                  Bounces
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {stats.campaigns.map((c) => (
                <tr key={c.id} className="hover:bg-zinc-50/70">
                  <th scope="row" className="max-w-72 px-4 py-2.5 text-left font-normal">
                    <Link href={`/campaigns/${c.id}`} className="block truncate font-medium text-zinc-900 hover:text-emerald-700 hover:underline">
                      {c.name}
                    </Link>
                    <span className="text-xs text-zinc-500">
                      {c.kind === "AUTOMATION" ? "Automation email" : "Campaign"} · {fmt(c.sent)} sent in total
                    </span>
                  </th>
                  <td className="px-3 py-2.5 whitespace-nowrap text-zinc-600">{c.startedAt ? formatDate(c.startedAt, prefs) : "—"}</td>
                  <td className="px-3 py-2.5 text-right text-zinc-900 tabular-nums">{fmt(c.sentInRange)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums" title={c.trackOpens ? `${fmt(c.opens)} unique opens` : "Open tracking was off"}>
                    <span className={c.openRate === "—" ? "text-zinc-400" : "text-zinc-900"}>{c.openRate}</span>
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums" title={c.trackClicks ? `${fmt(c.clicks)} unique clicks` : "Click tracking was off"}>
                    <span className={c.clickRate === "—" ? "text-zinc-400" : "text-zinc-900"}>{c.clickRate}</span>
                  </td>
                  <td className="px-3 py-2.5 text-right text-zinc-900 tabular-nums">{fmt(c.unsubscribes)}</td>
                  <td className="px-4 py-2.5 text-right text-zinc-900 tabular-nums">{fmt(c.bounces)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {stats.campaignsTruncated && (
            <p className="border-t px-4 py-2.5 text-xs text-zinc-500">
              Showing the {stats.campaigns.length} most recent campaigns. Pick a shorter date range to see the rest.
            </p>
          )}
        </div>
      )}
    </section>
  );
}

function StatisticsSkeleton() {
  return (
    <>
      <PageHeader title={TITLE} description={DESCRIPTION} />
      <Skeleton className="h-8 w-full sm:w-44" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-64 rounded-xl" />
      <Skeleton className="h-40 rounded-xl" />
    </>
  );
}
