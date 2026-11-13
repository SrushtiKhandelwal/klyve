import Link from "next/link";
import type { ReactNode } from "react";
import { BarChart3, CheckCircle2, DoorOpen, Hourglass, Inbox, Mail, UserPlus, Users } from "lucide-react";
import { Glyph } from "@/components/brand/glyph";
import { RelativeTime } from "@/components/campaigns/local-time";
import { formatCount } from "@/components/campaigns/types";
import { EntriesChart } from "@/components/automations/stats/entries-chart";
import { RUN_STATUS_META, RunStatusBadge } from "@/components/automations/stats/run-status";
import { getAutomationStats, RUN_STATUSES, type AutomationStatsData, type EmailStepStats } from "@/lib/automations/stats";
import { campaignRates, formatRate, OPENS_DISCLAIMER } from "@/lib/tracking/metrics";
import { requireActiveWorkspace } from "@/lib/workspace";
import { cn } from "@/lib/utils";

// An automation's Statistics: who entered and where they are now, how each
// email performed, why people left early, and the latest people through.
//
// An async Server Component: it reads the session (to find the workspace),
// so the page must render it inside <Suspense>. Email addresses are masked so
// the page is safe to screen-share.

export async function AutomationStats({ automationId }: { automationId: string }) {
  const ws = await requireActiveWorkspace();
  const stats = await getAutomationStats(ws, automationId);

  if (!stats) {
    return <p className="rounded-xl border bg-white p-5 text-sm text-zinc-500">This automation doesn&apos;t exist (or was deleted).</p>;
  }

  // Nobody has entered yet: one friendly box instead of a wall of zeros.
  if (stats.runs.total === 0) return <EmptyState status={stats.automation.status} />;

  return (
    <section aria-labelledby="automation-stats-title" className="flex flex-col gap-4">
      <div>
        <h2 id="automation-stats-title" className="font-semibold text-zinc-900">
          Statistics
        </h2>
        <p className="text-sm text-zinc-500">Charts cover the last {stats.days} days (UTC). Totals are all time.</p>
      </div>

      <StatCards stats={stats} />

      <Panel title="Where people are now" icon={<Users aria-hidden className="size-4 text-zinc-400" />}>
        <StatusBreakdown stats={stats} />
      </Panel>

      <Panel title="People entering per day" icon={<BarChart3 aria-hidden className="size-4 text-zinc-400" />}>
        <EntriesChart daily={stats.daily} />
      </Panel>

      <Panel title="Emails" icon={<Mail aria-hidden className="size-4 text-zinc-400" />}>
        <EmailFunnels emails={stats.emails} />
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Why people left early" icon={<DoorOpen aria-hidden className="size-4 text-zinc-400" />}>
          <ExitReasons stats={stats} />
        </Panel>
        <Panel title="Latest people" icon={<Inbox aria-hidden className="size-4 text-zinc-400" />}>
          <RecentRuns stats={stats} />
        </Panel>
      </div>
    </section>
  );
}

function EmptyState({ status }: { status: AutomationStatsData["automation"]["status"] }) {
  const text =
    status === "ACTIVE"
      ? "It's on and waiting. People enter as soon as the trigger happens (for example, when someone joins the list). If it starts “by hand”, add people from a contact's page."
      : status === "PAUSED"
        ? "It's paused, so nobody new can enter. Turn it back on to start."
        : "Turn it on when you're happy with the steps. Only people who trigger it after that moment will enter.";
  return (
    <section className="flex flex-col items-center rounded-xl border border-dashed border-zinc-300 bg-white px-6 py-10 text-center">
      <Glyph icon={UserPlus} size="xl" strokeWidth={1.5} className="mb-4" />
      <h2 className="font-semibold text-zinc-900">Nobody has entered yet</h2>
      <p className="mt-1 max-w-md text-sm text-zinc-500">{text}</p>
      <p className="mt-3 max-w-sm text-xs text-zinc-400">Statistics appear here as soon as the first person enters.</p>
    </section>
  );
}

function StatCards({ stats }: { stats: AutomationStatsData }) {
  const { runs } = stats;
  const left = runs.byStatus.EXITED + runs.byStatus.FAILED;
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatCard
        label={`Entered (${stats.days} days)`}
        value={runs.enteredLast30}
        icon={<UserPlus aria-hidden className="size-4" />}
        accent
        note={`${formatCount(runs.enteredLast7)} in the last 7 days · ${formatCount(runs.total)} all time`}
      />
      <StatCard
        label="In progress"
        value={runs.inProgress}
        icon={<Hourglass aria-hidden className="size-4" />}
        note={`${formatCount(runs.byStatus.WAITING)} waiting, ${formatCount(runs.byStatus.ACTIVE)} about to move on`}
      />
      <StatCard
        label="Completed"
        value={runs.byStatus.COMPLETED}
        icon={<CheckCircle2 aria-hidden className="size-4" />}
        note={`${formatRate(runs.byStatus.COMPLETED, runs.total)} of everyone who entered`}
      />
      <StatCard
        label="Left early"
        value={left}
        icon={<DoorOpen aria-hidden className="size-4" />}
        note={runs.byStatus.FAILED ? `Including ${formatCount(runs.byStatus.FAILED)} failed` : "Unsubscribed, removed or exited"}
      />
    </div>
  );
}

function StatCard({ label, value, note, icon, accent }: { label: string; value: number; note: string; icon: ReactNode; accent?: boolean }) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1 rounded-xl border bg-white p-3 sm:p-4", accent && "border-emerald-200 bg-emerald-50/40")}>
      <p className="flex items-center gap-1.5 text-xs font-medium text-zinc-500">
        <span className={accent ? "text-emerald-700" : "text-zinc-400"}>{icon}</span>
        {label}
      </p>
      <p className="text-2xl font-semibold text-zinc-900 tabular-nums">{formatCount(value)}</p>
      <p className="text-xs text-zinc-500">{note}</p>
    </div>
  );
}

function Panel({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-3 rounded-xl border bg-white p-4 sm:p-5">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-zinc-900">
        {icon}
        {title}
      </h3>
      {children}
    </div>
  );
}

/** One stacked bar of every run by status, with a legend that holds the exact numbers. */
function StatusBreakdown({ stats }: { stats: AutomationStatsData }) {
  const { total, byStatus } = stats.runs;
  return (
    <div className="flex flex-col gap-3">
      <div
        role="img"
        aria-label={RUN_STATUSES.map((s) => `${RUN_STATUS_META[s].label}: ${formatCount(byStatus[s])}`).join(", ")}
        className="flex h-3 w-full overflow-hidden rounded-full bg-zinc-100"
      >
        {RUN_STATUSES.filter((s) => byStatus[s] > 0).map((s) => (
          <div key={s} className={RUN_STATUS_META[s].bar} style={{ width: `${(byStatus[s] / total) * 100}%` }} />
        ))}
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3 lg:grid-cols-5">
        {RUN_STATUSES.map((s) => (
          <div key={s} className="flex min-w-0 items-start gap-2">
            <span aria-hidden className={cn("mt-1.5 size-2 shrink-0 rounded-full", RUN_STATUS_META[s].bar)} />
            <div className="min-w-0">
              <dt className="text-zinc-500">{RUN_STATUS_META[s].label}</dt>
              <dd className="font-medium text-zinc-900 tabular-nums">
                {formatCount(byStatus[s])} <span className="text-xs font-normal text-zinc-500">({formatRate(byStatus[s], total)})</span>
              </dd>
            </div>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** Per email: sent → opened → clicked as bars, plus unsubscribes and bounces. */
function EmailFunnels({ emails }: { emails: EmailStepStats[] }) {
  if (emails.length === 0) return <p className="text-sm text-zinc-500">This automation has no emails.</p>;
  return (
    <div className="flex flex-col gap-3">
      <ol className="flex flex-col divide-y">
        {emails.map((e, i) => {
          const rates = campaignRates({
            sentCount: e.sent,
            openCount: e.opened,
            clickCount: e.clicked,
            bounceCount: e.bounced,
            complaintCount: e.complained,
            unsubscribeCount: e.unsubscribed,
          });
          return (
            <li key={e.stepId} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-zinc-900">
                  <span className="text-zinc-400">{i + 1}.</span> {e.name}
                  {!e.inWorkflow && <span className="ml-2 text-xs font-normal text-zinc-500">(removed from the workflow)</span>}
                </p>
                {e.subject && <p className="truncate text-xs text-zinc-500">Subject: {e.subject}</p>}
              </div>
              {e.sent === 0 ? (
                <p className="text-xs text-zinc-500">Not sent to anyone yet.</p>
              ) : (
                <>
                  <FunnelBar label="Sent" value={e.sent} of={e.sent} rate={null} className="bg-zinc-400" />
                  <FunnelBar label="Opened" value={e.opened} of={e.sent} rate={rates.openRate} className="bg-emerald-600" />
                  <FunnelBar label="Clicked" value={e.clicked} of={e.sent} rate={rates.clickRate} className="bg-violet-600" />
                  <p className="text-xs text-zinc-500">
                    Unsubscribed {formatCount(e.unsubscribed)} ({rates.unsubscribeRate}) · Bounced {formatCount(e.bounced)} (
                    {rates.bounceRate})
                    {e.complained > 0 ? ` · Marked as spam ${formatCount(e.complained)} (${rates.complaintRate})` : ""}
                  </p>
                </>
              )}
            </li>
          );
        })}
      </ol>
      <p className="text-xs text-zinc-500">
        Rates are out of emails delivered (sent minus bounces), each person counted once. {OPENS_DISCLAIMER}
      </p>
    </div>
  );
}

function FunnelBar({ label, value, of, rate, className }: { label: string; value: number; of: number; rate: string | null; className: string }) {
  const pct = of > 0 ? Math.min(100, (value / of) * 100) : 0;
  return (
    <div className="grid grid-cols-[4.5rem_1fr_auto] items-center gap-2 text-xs sm:grid-cols-[5rem_1fr_7rem]">
      <span className="text-zinc-600">{label}</span>
      <div className="h-2.5 overflow-hidden rounded-full bg-zinc-100" aria-hidden>
        <div className={cn("h-full rounded-full", className)} style={{ width: value === 0 ? 0 : `max(4px, ${pct}%)` }} />
      </div>
      <span className="text-right text-zinc-900 tabular-nums">
        {formatCount(value)}
        {rate !== null && <span className="text-zinc-500"> · {rate}</span>}
      </span>
    </div>
  );
}

function ExitReasons({ stats }: { stats: AutomationStatsData }) {
  if (stats.exits.length === 0) return <p className="text-sm text-zinc-500">Nobody has left early. 🎉</p>;
  const max = Math.max(...stats.exits.map((e) => e.count));
  return (
    <ul className="flex flex-col gap-2.5 text-sm">
      {stats.exits.map((e) => (
        <li key={`${e.status}:${e.reason}`} className="flex flex-col gap-1">
          <div className="flex items-start justify-between gap-3">
            <span className="min-w-0 break-words text-zinc-800">
              {e.reason}
              {e.status === "FAILED" && <span className="ml-1.5 text-xs text-red-600">(failed)</span>}
            </span>
            <span className="font-medium text-zinc-900 tabular-nums">{formatCount(e.count)}</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-zinc-100" aria-hidden>
            <div
              className={cn("h-full rounded-full", e.status === "FAILED" ? "bg-red-400" : "bg-amber-400")}
              style={{ width: `${(e.count / max) * 100}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

function RecentRuns({ stats }: { stats: AutomationStatsData }) {
  return (
    <div className="flex flex-col gap-2">
      <ul className="divide-y text-sm">
        {stats.recent.map((r) => (
          <li key={r.id} className="flex flex-col gap-1 py-2.5 sm:flex-row sm:items-center sm:gap-3">
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium text-zinc-900">
                {r.contactId ? (
                  <Link href={`/contacts/${r.contactId}`} className="hover:text-emerald-700 hover:underline">
                    {r.maskedEmail ?? "Unknown address"}
                  </Link>
                ) : (
                  <span className="font-normal text-zinc-400">Deleted contact</span>
                )}
              </p>
              <p className="truncate text-xs text-zinc-500">
                {r.stepName
                  ? `${r.status === "FAILED" ? "Stopped at" : "Now at"}: ${r.stepName}`
                  : r.status === "COMPLETED"
                    ? "Went all the way through"
                    : "Left early"}
              </p>
            </div>
            <div className="flex items-center gap-3 sm:shrink-0">
              <RunStatusBadge status={r.status} />
              <span className="text-xs whitespace-nowrap text-zinc-500">
                <RelativeTime iso={r.startedAt} />
              </span>
            </div>
          </li>
        ))}
      </ul>
      <p className="text-xs text-zinc-500">Addresses are partly hidden so this page is safe to share on screen. The time is when they entered.</p>
    </div>
  );
}
