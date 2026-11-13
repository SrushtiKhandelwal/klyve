"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import {
  Ban,
  ExternalLink,
  Eye,
  EyeOff,
  Info,
  Loader2,
  MailCheck,
  MailX,
  MousePointerClick,
  Percent,
  RefreshCw,
  Send,
  ShieldAlert,
  TriangleAlert,
  UserMinus,
  type LucideIcon,
} from "lucide-react";
import { ExplainResultsButton, ExplainResultsPanel, useExplainResults } from "@/components/ai/explain-results";
import { RelativeTime } from "@/components/campaigns/local-time";
import { formatCount } from "@/components/campaigns/types";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { BOUNCE_RATE_WARNING, COMPLAINT_RATE_LIMIT, OPENS_DISCLAIMER, formatRate } from "@/lib/tracking/metrics";
import type { CampaignReport } from "@/lib/tracking/reports";
import { cn } from "@/lib/utils";
import { EngagementChart } from "./engagement-chart";

/** 0.003 → "0.3%" (same formatting as every other rate). */
const pct = (fraction: number) => formatRate(Math.round(fraction * 1_000_000), 1_000_000);

/**
 * The campaign report: headline numbers, health warnings, the engagement
 * timeline and the most-clicked links. The numbers come from
 * src/lib/tracking/reports.ts and refresh via useLiveReport (see there).
 */
export function CampaignReportSection({
  report,
  loading,
  error,
  onRefresh,
}: {
  report: CampaignReport;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
}) {
  const { stats, rates, trackOpens, trackClicks } = report;
  const complaintHigh = stats.sentCount > 0 && report.complaintRatio >= COMPLAINT_RATE_LIMIT;
  const bounceHigh = stats.sentCount > 0 && report.bounceRatio >= BOUNCE_RATE_WARNING;
  // "Explain my results" (AI) once something has been sent.
  const explain = useExplainResults(report.campaignId);
  const canExplain = stats.sentCount > 0;

  return (
    <section aria-labelledby="report-title" className="flex flex-col gap-6 rounded-xl border bg-white p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="report-title" className="font-semibold text-zinc-900">
            Report
          </h2>
          <p className="mt-0.5 text-xs text-zinc-500">
            Updated <RelativeTime iso={report.generatedAt} />
            {report.status === "SENDING" && " · updates by itself while sending"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canExplain && <ExplainResultsButton state={explain} />}
          <Button type="button" variant="outline" size="sm" onClick={onRefresh} disabled={loading}>
            {loading ? <Loader2 className="animate-spin" aria-hidden /> : <RefreshCw aria-hidden />}
            Refresh
          </Button>
        </div>
      </div>

      {canExplain && <ExplainResultsPanel state={explain} />}

      {error && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {complaintHigh && (
        <HealthWarning tone="red" icon={ShieldAlert} title={`Spam complaints are high: ${rates.complaintRate} of people marked this as spam`}>
          Gmail and Yahoo expect bulk senders to stay under {pct(COMPLAINT_RATE_LIMIT)} spam complaints (ideally under 0.1%). Above
          that, your emails start going to spam or get blocked, for every campaign you send. To bring it down: only email people
          who asked to hear from you, make the unsubscribe link easy to find, remove people who haven&apos;t opened in months,
          and tell people why they&apos;re getting your email.
        </HealthWarning>
      )}
      {bounceHigh && (
        <HealthWarning tone="amber" icon={TriangleAlert} title={`Many emails bounced: ${rates.bounceRate} couldn't be delivered`}>
          Email providers see a bounce rate above {pct(BOUNCE_RATE_WARNING)} as a sign of an old or bought list, and start to
          trust all your emails less. Addresses that bounced for good are marked Bounced and left out of future campaigns. Keep
          your list fresh: remove addresses you haven&apos;t emailed in a long time, and never import lists you bought.
        </HealthWarning>
      )}

      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <ReportStat icon={Send} label="Sent" value={formatCount(stats.sentCount)} sub="Accepted by your provider" />
        <DeliveredStat report={report} />
        {trackOpens ? (
          <ReportStat icon={Eye} tone="emerald" label="Opened" value={formatCount(stats.openCount)} sub={`${rates.openRate} open rate`} />
        ) : (
          <ReportStat icon={EyeOff} label="Opened" value="Off" sub="Open tracking was off for this campaign" />
        )}
        {trackClicks ? (
          <ReportStat
            icon={MousePointerClick}
            tone="violet"
            label="Clicked"
            value={formatCount(stats.clickCount)}
            sub={`${rates.clickRate} click rate`}
          />
        ) : (
          <ReportStat icon={MousePointerClick} label="Clicked" value="Off" sub="Click tracking was off for this campaign" />
        )}
        <ReportStat
          icon={Percent}
          label="Click-to-open"
          value={trackOpens && trackClicks ? rates.clickToOpen : "—"}
          sub={trackOpens && trackClicks ? "Of people who opened, how many clicked" : "Needs open and click tracking"}
        />
        <ReportStat icon={UserMinus} label="Unsubscribed" value={formatCount(stats.unsubscribeCount)} sub={`${rates.unsubscribeRate} of sent`} />
        <ReportStat
          icon={MailX}
          tone={bounceHigh ? "amber" : undefined}
          label="Bounced"
          value={formatCount(stats.bounceCount)}
          sub={
            <>
              {rates.bounceRate} · address doesn&apos;t exist
              {report.bounces.soft > 0 && (
                <span className="block">
                  + {formatCount(report.bounces.soft)} soft (temporary, not in the rate)
                </span>
              )}
            </>
          }
          title="Hard bounces: the address doesn't exist, so it won't be emailed again. Soft bounces are temporary problems (like a full mailbox) and the next email may well arrive."
        />
        <ReportStat
          icon={Ban}
          tone={complaintHigh ? "red" : undefined}
          label="Spam complaints"
          value={formatCount(stats.complaintCount)}
          sub={`${rates.complaintRate} of sent`}
        />
      </dl>

      {(trackOpens || trackClicks) && (
        <div className="flex flex-col gap-1.5 rounded-lg bg-zinc-50 px-3 py-2.5 text-xs text-zinc-600">
          {trackOpens && (
            <p className="flex items-start gap-2">
              <Info className="mt-px size-3.5 shrink-0 text-zinc-400" aria-hidden />
              <span>
                {OPENS_DISCLAIMER}{" "}
                <span className="font-medium text-zinc-800">
                  {formatCount(report.totals.botOpens)} automated {report.totals.botOpens === 1 ? "open" : "opens"} excluded
                </span>{" "}
                (e.g. Apple Mail privacy).
              </span>
            </p>
          )}
          {trackClicks && report.totals.botClicks > 0 && (
            <p className="flex items-start gap-2">
              <Info className="mt-px size-3.5 shrink-0 text-zinc-400" aria-hidden />
              <span>
                {formatCount(report.totals.botClicks)} automated {report.totals.botClicks === 1 ? "click" : "clicks"} (e.g. email
                security scanners checking links) left out of the timeline.
              </span>
            </p>
          )}
        </div>
      )}

      <div className="flex flex-col gap-3">
        <h3 className="text-sm font-semibold text-zinc-900">Opens and clicks over time</h3>
        {!trackOpens && !trackClicks ? (
          <TrackingOff text="Open and click tracking were off for this campaign, so there's no timeline." />
        ) : !report.startedAt ? (
          <p className="text-sm text-zinc-500">The timeline starts once sending begins.</p>
        ) : (
          <>
            {!trackOpens && <TrackingOff text="Open tracking was off for this campaign. Only clicks are shown." />}
            {!trackClicks && <TrackingOff text="Click tracking was off for this campaign. Only opens are shown." />}
            <EngagementChart
              hourly={report.timeline.hourly}
              daily={report.timeline.daily}
              defaultView={report.timeline.defaultView}
              showOpens={trackOpens}
              showClicks={trackClicks}
            />
          </>
        )}
      </div>

      <TopLinks report={report} />
    </section>
  );
}

function HealthWarning({
  tone,
  icon: Icon,
  title,
  children,
}: {
  tone: "red" | "amber";
  icon: LucideIcon;
  title: string;
  children: ReactNode;
}) {
  return (
    <div
      role="alert"
      className={cn(
        "flex gap-3 rounded-xl border p-4 text-sm",
        tone === "red" ? "border-red-300 bg-red-50 text-red-950" : "border-amber-300 bg-amber-50 text-amber-950",
      )}
    >
      <Icon className={cn("mt-0.5 size-5 shrink-0", tone === "red" ? "text-red-600" : "text-amber-600")} aria-hidden />
      <div className="flex min-w-0 flex-col gap-1">
        <p className="font-semibold">{title}</p>
        <p className={tone === "red" ? "text-red-900" : "text-amber-900"}>{children}</p>
      </div>
    </div>
  );
}

const TONES = {
  emerald: "text-emerald-600",
  violet: "text-violet-600",
  amber: "text-amber-600",
  red: "text-red-600",
} as const;

function ReportStat({
  icon: Icon,
  label,
  value,
  sub,
  tone,
  title,
  extra,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  sub: ReactNode;
  tone?: keyof typeof TONES;
  title?: string;
  extra?: ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col gap-0.5 rounded-lg border px-3 py-2.5",
        tone === "red" ? "border-red-200 bg-red-50/60" : tone === "amber" ? "border-amber-200 bg-amber-50/60" : "bg-zinc-50/60",
      )}
      title={title}
    >
      <dt className="flex items-center gap-1.5 text-xs font-medium text-zinc-500">
        <Icon className={cn("size-3.5 shrink-0", tone ? TONES[tone] : "text-zinc-400")} aria-hidden />
        {label}
        {extra}
      </dt>
      <dd className="text-xl font-semibold text-zinc-900 tabular-nums">{value}</dd>
      <dd className="text-xs text-zinc-500">{sub}</dd>
    </div>
  );
}

/** Delivered is only known when the provider reports it through webhooks; otherwise "—" (never a fake 0). */
function DeliveredStat({ report }: { report: CampaignReport }) {
  if (report.delivered !== null) {
    return (
      <ReportStat
        icon={MailCheck}
        label="Delivered"
        value={formatCount(report.delivered)}
        sub={`${formatRate(report.delivered, report.stats.sentCount)} of sent, confirmed by your provider`}
      />
    );
  }
  const why = report.webhooksConnected
    ? "Your provider hasn't reported deliveries for this campaign. Some providers only report bounces and spam complaints."
    : "Connect bounce tracking in Settings → Sending providers";
  return (
    <ReportStat
      icon={MailCheck}
      label="Delivered"
      value="—"
      sub={
        report.webhooksConnected ? (
          "Not reported by your provider"
        ) : (
          <Link href="/settings/providers" className="underline underline-offset-2 hover:text-zinc-800">
            Set up bounce tracking
          </Link>
        )
      }
      extra={
        <Tooltip>
          <TooltipTrigger
            render={<button type="button" aria-label={`Why no number? ${why}`} className="rounded-full text-zinc-400 outline-none hover:text-zinc-700 focus-visible:ring-2 focus-visible:ring-emerald-500/40" />}
          >
            <Info className="size-3.5" aria-hidden />
          </TooltipTrigger>
          <TooltipContent>{why}</TooltipContent>
        </Tooltip>
      }
    />
  );
}

function TrackingOff({ text }: { text: string }) {
  return (
    <p className="flex items-start gap-2 rounded-lg border border-dashed px-3 py-2.5 text-sm text-zinc-600">
      <EyeOff className="mt-0.5 size-4 shrink-0 text-zinc-400" aria-hidden />
      {text}
    </p>
  );
}

/** Links people clicked, most clicked first, with a bar showing each link's share of clickers. */
function TopLinks({ report }: { report: CampaignReport }) {
  const links = report.topLinks;
  const maxUnique = Math.max(1, ...links.map((l) => l.uniqueClicks));

  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-sm font-semibold text-zinc-900">Top links</h3>
      {!report.trackClicks ? (
        <TrackingOff text="Click tracking was off for this campaign, so link clicks weren't counted." />
      ) : links.length === 0 ? (
        <p className="text-sm text-zinc-500">No tracked links in this email.</p>
      ) : (
        <div className="overflow-hidden rounded-lg border">
          <table className="w-full table-fixed text-sm">
            <thead className="bg-zinc-50 text-xs text-zinc-500">
              <tr>
                <th scope="col" className="px-3 py-2 text-left font-medium">
                  Link
                </th>
                <th scope="col" className="w-20 px-3 py-2 text-right font-medium sm:w-28">
                  <span title="People who clicked this link at least once">People</span>
                </th>
                <th scope="col" className="w-16 px-3 py-2 text-right font-medium sm:w-28">
                  <span title="All clicks, including repeat clicks">Clicks</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {links.map((l) => {
                // Links with merge tags ({{ … }}) differ per person, so they can't be opened from here.
                const openable = /^https?:\/\//i.test(l.url) && !l.url.includes("{{");
                return (
                  <tr key={l.id}>
                    <td className="px-3 py-2.5 align-top">
                      <div className="flex min-w-0 flex-col gap-1.5">
                        {openable ? (
                          <a
                            href={l.url}
                            target="_blank"
                            rel="noopener noreferrer nofollow"
                            title={l.url}
                            className="inline-flex min-w-0 items-center gap-1 text-zinc-900 hover:text-emerald-700"
                          >
                            <span className="truncate">{l.shortUrl}</span>
                            <ExternalLink className="size-3 shrink-0 text-zinc-400" aria-hidden />
                            <span className="sr-only">(opens in a new tab)</span>
                          </a>
                        ) : (
                          <span className="truncate font-mono text-xs text-zinc-700" title={l.url}>
                            {l.shortUrl}
                          </span>
                        )}
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-100" aria-hidden>
                          <div className="h-full rounded-full bg-violet-500" style={{ width: `${(l.uniqueClicks / maxUnique) * 100}%` }} />
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-right align-top font-medium text-zinc-900 tabular-nums">{formatCount(l.uniqueClicks)}</td>
                    <td className="px-3 py-2.5 text-right align-top text-zinc-600 tabular-nums">{formatCount(l.clicks)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
