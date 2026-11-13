"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  CalendarClock,
  CircleAlert,
  CircleCheck,
  CircleX,
  Clock,
  Info,
  Loader2,
  Send,
  SkipForward,
  type LucideIcon,
} from "lucide-react";
import { Glyph } from "@/components/brand/glyph";
import { getCampaignProgressAction } from "@/app/actions/campaigns";
import { CampaignStatusBadge } from "@/components/campaigns/campaign-status-badge";
import { LocalDateTime, RelativeTime } from "@/components/campaigns/local-time";
import { formatCount } from "@/components/campaigns/types";
import { useNow } from "@/components/settings/senders/use-now";
import { cn } from "@/lib/utils";
import { CampaignStatusActions } from "./status-actions";
import { LIVE_STATUSES, toProgressView, type ProgressView } from "./progress";
import { CampaignReportSection } from "./campaign-report";
import { RecipientsTable } from "./recipients-table";
import { useLiveReport } from "./use-live-report";
import type { CampaignReport } from "@/lib/tracking/reports";

/** How often to ask the server for fresh numbers while the campaign is live. */
const POLL_MS = 3000;

/**
 * The page of a campaign that's scheduled, sending or finished: a big status
 * header with live progress, the actions that make sense right now, the
 * report (opens, clicks, bounces…) and the list of recipients. `children` is
 * the server-rendered summary underneath.
 */
export function CampaignStatusView({
  campaign,
  initialProgress,
  initialReport,
  children,
}: {
  campaign: { id: string; name: string; scheduledAt: string | null; canDelete: boolean };
  initialProgress: ProgressView;
  /** The report as the server first rendered it (null for a campaign that hasn't started). */
  initialReport: CampaignReport | null;
  children: ReactNode;
}) {
  const progress = useLiveProgress(campaign.id, initialProgress);
  const { status, counts, total } = progress;

  // Counted in a stable way so the recipients table can refresh as numbers change.
  const processed = counts.SENT + counts.FAILED + counts.SKIPPED;
  const refreshKey = `${status}:${processed}`;

  // The report refreshes along with the progress polling (see use-live-report.ts).
  const live = useLiveReport(campaign.id, initialReport, { status, finishedAt: progress.finishedAt, refreshKey });
  const report = live.report;
  // Nothing to report before sending starts (scheduled), or if nothing was ever sent.
  const showReport = !!report && status !== "SCHEDULED" && (status === "SENDING" || counts.SENT > 0 || report.stats.sentCount > 0);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <Link href="/campaigns" className="inline-flex w-fit items-center gap-1.5 text-sm font-medium text-zinc-500 hover:text-zinc-900">
          <ArrowLeft className="size-4" aria-hidden />
          Campaigns
        </Link>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 flex-col gap-1.5">
            <h1 className="text-2xl font-semibold tracking-tight break-words text-zinc-900 sm:text-3xl">{campaign.name}</h1>
            <div className="flex flex-wrap items-center gap-2 text-sm text-zinc-500">
              <CampaignStatusBadge status={status} />
              <StatusLine status={status} progress={progress} scheduledAt={campaign.scheduledAt} />
            </div>
          </div>
          <CampaignStatusActions campaignId={campaign.id} name={campaign.name} status={status} canDelete={campaign.canDelete} />
        </div>
      </div>

      <ProblemBox status={status} lastError={progress.lastError} />

      {status === "SCHEDULED" ? (
        <ScheduledCard scheduledAt={campaign.scheduledAt} />
      ) : (
        <ProgressCard progress={progress} />
      )}

      {showReport && report && (
        <CampaignReportSection report={report} loading={live.loading} error={live.error} onRefresh={() => void live.refresh()} />
      )}

      {total > 0 && (
        <RecipientsTable
          campaignId={campaign.id}
          counts={counts}
          total={total}
          // Also reloads the rows after a report refresh, so new opens/clicks show up.
          refreshKey={`${refreshKey}:${report?.generatedAt ?? ""}`}
          engagement={
            showReport && report
              ? { trackOpens: report.trackOpens, trackClicks: report.trackClicks, counts: report.recipients }
              : null
          }
        />
      )}

      {children}
    </div>
  );
}

/**
 * Polls getCampaignProgressAction every few seconds while the campaign is
 * live (scheduled, sending or paused) and stops once it's finished. Each
 * request waits for the previous one, so slow answers never pile up, and
 * nothing is fetched while the tab is in the background.
 */
function useLiveProgress(campaignId: string, initial: ProgressView): ProgressView {
  const router = useRouter();
  const [progress, setProgress] = useState(initial);
  const [fromServer, setFromServer] = useState(initial);

  // After an action (pause, resume…) the server re-renders the page with
  // fresh numbers: take those (React's "adjust state when a prop changes").
  if (initial !== fromServer) {
    setFromServer(initial);
    setProgress(initial);
  }

  const live = LIVE_STATUSES.includes(progress.status);

  useEffect(() => {
    if (!live) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;

    async function tick() {
      if (document.visibilityState === "visible") {
        try {
          const res = await getCampaignProgressAction(campaignId);
          if (stopped) return;
          if (res.ok) {
            const next = toProgressView(res.progress);
            setProgress(next);
            // Unscheduled from another tab: the page becomes the draft editor again.
            if (next.status === "DRAFT") router.refresh();
          } else {
            router.refresh(); // deleted meanwhile → the page shows "not found"
            return;
          }
        } catch {
          // A network blip: just try again on the next tick.
        }
      }
      if (!stopped) timer = setTimeout(tick, POLL_MS);
    }

    timer = setTimeout(tick, POLL_MS);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [campaignId, live, router]);

  return progress;
}

function StatusLine({ status, progress, scheduledAt }: { status: string; progress: ProgressView; scheduledAt: string | null }) {
  if (status === "SCHEDULED" && scheduledAt) {
    return (
      <span>
        Goes out <LocalDateTime iso={scheduledAt} />
      </span>
    );
  }
  if (status === "SENDING") {
    return (
      <span className="inline-flex items-center gap-1.5" role="status">
        <Loader2 className="size-3.5 animate-spin text-amber-600" aria-hidden />
        Sending now{progress.startedAt && <> · started <RelativeTime iso={progress.startedAt} /></>}
      </span>
    );
  }
  if (status === "PAUSED") return <span>Paused. Nothing more is sent until you resume.</span>;
  if (status === "SENT" && progress.finishedAt) {
    return (
      <span>
        Finished <LocalDateTime iso={progress.finishedAt} />
      </span>
    );
  }
  if (status === "CANCELLED" && progress.finishedAt) {
    return (
      <span>
        Cancelled <LocalDateTime iso={progress.finishedAt} />
      </span>
    );
  }
  return null;
}

/**
 * Why it stopped, in plain English. PAUSED/FAILED: a clear warning with what
 * to do. SENDING with a note (e.g. the provider's daily cap was reached): just
 * information, sending carries on by itself.
 */
function ProblemBox({ status, lastError }: { status: string; lastError: string | null }) {
  if (!lastError) return null;
  if (status === "PAUSED") {
    return (
      <div role="alert" className="flex gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
        <CircleAlert className="mt-0.5 size-5 shrink-0 text-amber-600" aria-hidden />
        <div className="flex min-w-0 flex-col gap-1">
          <p className="font-semibold">Sending is paused</p>
          <p className="break-words">{lastError}</p>
          <p className="text-amber-800">
            Fix the problem (often in{" "}
            <Link href="/settings/providers" className="font-medium underline underline-offset-2">
              Settings → Providers
            </Link>
            ), then press <span className="font-medium">Resume</span>. Nobody gets the email twice.
          </p>
        </div>
      </div>
    );
  }
  if (status === "FAILED") {
    return (
      <div role="alert" className="flex gap-3 rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-950">
        <CircleX className="mt-0.5 size-5 shrink-0 text-red-600" aria-hidden />
        <div className="flex min-w-0 flex-col gap-1">
          <p className="font-semibold">This campaign couldn&apos;t be sent</p>
          <p className="break-words">{lastError}</p>
          <p className="text-red-800">
            Check your{" "}
            <Link href="/settings/providers" className="font-medium underline underline-offset-2">
              email provider
            </Link>{" "}
            and{" "}
            <Link href="/settings/senders" className="font-medium underline underline-offset-2">
              sender
            </Link>
            , then duplicate this campaign to try again. People who already got it are listed below.
          </p>
        </div>
      </div>
    );
  }
  if (status === "SENDING" || status === "SCHEDULED") {
    return (
      <div role="status" className="flex gap-3 rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-950">
        <Info className="mt-0.5 size-5 shrink-0 text-sky-600" aria-hidden />
        <div className="flex min-w-0 flex-col gap-1">
          <p className="break-words">{lastError}</p>
          <p className="text-sky-800">Just so you know: nothing to do here, sending carries on by itself.</p>
        </div>
      </div>
    );
  }
  // SENT / CANCELLED: a summary note (e.g. "none could be delivered").
  return (
    <div className="flex gap-3 rounded-xl border bg-white p-4 text-sm text-zinc-700">
      <Info className="mt-0.5 size-5 shrink-0 text-zinc-400" aria-hidden />
      <p className="min-w-0 break-words">{lastError}</p>
    </div>
  );
}

function ScheduledCard({ scheduledAt }: { scheduledAt: string | null }) {
  return (
    <section className="flex flex-col gap-4 rounded-xl border bg-white p-5 sm:flex-row sm:items-center">
      {/* Sky blue = "scheduled", the same colour as its status label. */}
      <Glyph icon={CalendarClock} size="xl" tone="current" strokeWidth={1.5} className="text-sky-600" />
      <div className="min-w-0">
        <p className="text-lg font-semibold text-zinc-900">
          {scheduledAt ? (
            <>
              Scheduled for <LocalDateTime iso={scheduledAt} />
            </>
          ) : (
            "Scheduled"
          )}
        </p>
        <p className="mt-0.5 text-sm text-zinc-500">
          {scheduledAt && (
            <>
              That&apos;s <RelativeFuture iso={scheduledAt} />.{" "}
            </>
          )}
          The exact list of people is worked out when sending starts, so anyone who subscribes or unsubscribes before then is
          handled correctly. Want to change something? Unschedule it first.
        </p>
      </div>
    </section>
  );
}

/** "in 3 hours" (or "any moment now" once the time has come). */
function RelativeFuture({ iso }: { iso: string }) {
  // null on the server and during hydration (so both render the same), then ticks.
  const now = useNow();
  if (now === null) return <span>soon</span>;
  const minutes = Math.round((new Date(iso).getTime() - now) / 60_000);
  const plural = (n: number, unit: string) => `in ${n} ${unit}${n === 1 ? "" : "s"}`;
  let text = "any moment now";
  if (minutes >= 60 * 24) text = plural(Math.round(minutes / (60 * 24)), "day");
  else if (minutes >= 60) text = plural(Math.round(minutes / 60), "hour");
  else if (minutes >= 1) text = plural(minutes, "minute");
  return <span>{text}</span>;
}

function ProgressCard({ progress }: { progress: ProgressView }) {
  const { counts, total, status } = progress;
  const queued = counts.PENDING + counts.SENDING;
  const pct = (n: number) => (total > 0 ? (n / total) * 100 : 0);
  const done = counts.SENT + counts.FAILED + counts.SKIPPED;
  const percentDone = total > 0 ? Math.floor((done / total) * 100) : 0;

  return (
    <section aria-labelledby="progress-title" className="flex flex-col gap-5 rounded-xl border bg-white p-5">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 id="progress-title" className="text-sm font-medium text-zinc-500">
            {status === "SENT" ? "Delivered to your provider" : "Progress"}
          </h2>
          <p className="text-3xl font-semibold tracking-tight text-zinc-900 tabular-nums">
            {formatCount(counts.SENT)}
            <span className="text-lg font-normal text-zinc-400"> / {formatCount(total)} sent</span>
          </p>
        </div>
        {total > 0 && <p className="text-sm font-medium text-zinc-500 tabular-nums">{percentDone}% done</p>}
      </div>

      {/* Stacked bar: sent (green), failed (red), skipped (grey); the rest is still queued. */}
      <div
        className="flex h-3 w-full overflow-hidden rounded-full bg-zinc-100"
        role="progressbar"
        aria-label="Sending progress"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={done}
        aria-valuetext={`${formatCount(counts.SENT)} sent, ${formatCount(counts.FAILED)} failed, ${formatCount(counts.SKIPPED)} skipped, ${formatCount(queued)} queued`}
      >
        <div className="h-full bg-emerald-500 transition-all duration-700" style={{ width: `${pct(counts.SENT)}%` }} />
        <div className="h-full bg-red-500 transition-all duration-700" style={{ width: `${pct(counts.FAILED)}%` }} />
        <div className="h-full bg-zinc-400 transition-all duration-700" style={{ width: `${pct(counts.SKIPPED)}%` }} />
        {status === "SENDING" && queued > 0 && <div className="h-full flex-1 animate-pulse bg-amber-100" />}
      </div>

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat icon={Clock} label="Queued" value={queued} tone="zinc" hint={status === "PAUSED" ? "Waiting for resume" : "Waiting to send"} />
        <Stat icon={Send} label="Sent" value={counts.SENT} tone="emerald" hint="Accepted by your provider" />
        <Stat icon={CircleX} label="Failed" value={counts.FAILED} tone="red" hint="See the reasons below" />
        <Stat icon={SkipForward} label="Skipped" value={counts.SKIPPED} tone="zinc" hint="Unsubscribed or cancelled" />
      </dl>

      {status === "SENT" && (
        <p className="flex items-center gap-2 text-sm text-emerald-800">
          <CircleCheck className="size-4 text-emerald-600" aria-hidden />
          All done. Every recipient was processed.
        </p>
      )}
    </section>
  );
}

function Stat({ icon: Icon, label, value, tone, hint }: { icon: LucideIcon; label: string; value: number; tone: "zinc" | "emerald" | "red"; hint: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-lg border bg-zinc-50/60 px-3 py-2.5">
      <dt className="flex items-center gap-1.5 text-xs font-medium text-zinc-500">
        <Icon
          className={cn("size-3.5", tone === "emerald" ? "text-emerald-600" : tone === "red" ? "text-red-600" : "text-zinc-400")}
          aria-hidden
        />
        {label}
      </dt>
      <dd
        className={cn(
          "text-xl font-semibold tabular-nums",
          tone === "emerald" ? "text-emerald-700" : tone === "red" && value > 0 ? "text-red-600" : "text-zinc-900",
        )}
      >
        {formatCount(value)}
      </dd>
      <dd className="text-xs text-zinc-500">{hint}</dd>
    </div>
  );
}
