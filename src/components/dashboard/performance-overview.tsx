import { ArrowDownRight, ArrowUpRight, Eye, MailCheck, Minus, MousePointerClick, UserMinus, type LucideIcon } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { formatRate } from "@/lib/tracking/metrics";
import { getWorkspacePerformance, type PeriodTotals } from "@/lib/tracking/reports";
import { cn } from "@/lib/utils";
import { requireActiveWorkspace } from "@/lib/workspace";

// "Last 30 days" strip on the dashboard: emails sent, average open and click
// rates and unsubscribes, each compared with the 30 days before. Render it
// inside <Suspense> (it reads the login cookie).

const DAYS = 30;
const numberFormat = new Intl.NumberFormat("en-US");

/** Up, down or flat, and whether that direction is good news. */
type Change = { direction: "up" | "down" | "flat"; text: string; good: boolean | null };

/** Counts: "+12%" (relative change). From 0 to something there's no % to show, so "new". */
function countChange(current: number, previous: number, upIsGood: boolean): Change | null {
  if (current === 0 && previous === 0) return null;
  if (previous === 0) return { direction: "up", text: "new", good: upIsGood };
  const change = (current - previous) / previous;
  if (Math.abs(change) < 0.005) return { direction: "flat", text: "same", good: null };
  const direction = change > 0 ? "up" : "down";
  return {
    direction,
    text: `${change > 0 ? "+" : "−"}${Math.round(Math.abs(change) * 100)}%`,
    good: direction === "up" ? upIsGood : !upIsGood,
  };
}

/** Rates: the difference in percentage points ("+2.1 pts"), which is easier to read than a % of a %. */
function rateChange(current: number | null, previous: number | null): Change | null {
  if (current === null || previous === null) return null;
  const points = (current - previous) * 100;
  if (Math.abs(points) < 0.05) return { direction: "flat", text: "same", good: null };
  const direction = points > 0 ? "up" : "down";
  return { direction, text: `${points > 0 ? "+" : "−"}${Math.abs(points).toFixed(1)} pts`, good: direction === "up" };
}

export async function PerformanceOverview() {
  // Checks login + workspace right next to the data; only THIS workspace's campaigns.
  const ws = await requireActiveWorkspace();
  const { current, previous } = await getWorkspacePerformance(ws.id, { days: DAYS });

  if (current.emailsSent === 0 && previous.emailsSent === 0) {
    return (
      <p className="rounded-xl border border-dashed border-zinc-300 bg-white px-4 py-6 text-center text-sm text-zinc-500">
        Nothing sent in the last {DAYS} days. Your open and click rates will show up here after your next campaign.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile
          icon={MailCheck}
          label="Emails sent"
          value={numberFormat.format(current.emailsSent)}
          sub={`${current.campaigns} ${current.campaigns === 1 ? "campaign" : "campaigns"}`}
          change={countChange(current.emailsSent, previous.emailsSent, true)}
        />
        <Tile
          icon={Eye}
          label="Average open rate"
          value={current.openRateText}
          sub={rateSub(current, "opens")}
          change={rateChange(current.openRate, previous.openRate)}
        />
        <Tile
          icon={MousePointerClick}
          label="Average click rate"
          value={current.clickRateText}
          sub={rateSub(current, "clicks")}
          change={rateChange(current.clickRate, previous.clickRate)}
        />
        <Tile
          icon={UserMinus}
          label="Unsubscribes"
          value={numberFormat.format(current.unsubscribes)}
          sub={`${formatRate(current.unsubscribes, current.emailsSent)} of emails sent`}
          // Fewer unsubscribes is the good direction.
          change={countChange(current.unsubscribes, previous.unsubscribes, false)}
        />
      </dl>
      <p className="text-xs text-zinc-500">
        Compared with the {DAYS} days before. Rates are for all emails together, so bigger campaigns count more. Opens are an
        estimate (some email apps open images automatically); automated opens are left out.
      </p>
    </div>
  );
}

function rateSub(t: PeriodTotals, what: "opens" | "clicks"): string {
  const rate = what === "opens" ? t.openRate : t.clickRate;
  if (rate === null) return t.emailsSent > 0 ? `${what === "opens" ? "Open" : "Click"} tracking was off` : "—";
  return what === "opens" ? `${numberFormat.format(t.opens)} people opened` : `${numberFormat.format(t.clicks)} people clicked`;
}

function Tile({ icon: Icon, label, value, sub, change }: { icon: LucideIcon; label: string; value: string; sub: string; change: Change | null }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-xl border bg-white p-4 shadow-xs">
      <dt className="flex items-center gap-1.5 text-xs font-medium text-zinc-500">
        <Icon className="size-3.5 text-emerald-600" aria-hidden />
        {label}
      </dt>
      <dd className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="text-2xl font-semibold tracking-tight text-zinc-900 tabular-nums">{value}</span>
        {change && <ChangeBadge change={change} />}
      </dd>
      <dd className="text-xs text-zinc-500">{sub}</dd>
    </div>
  );
}

function ChangeBadge({ change }: { change: Change }) {
  const Icon = change.direction === "up" ? ArrowUpRight : change.direction === "down" ? ArrowDownRight : Minus;
  const spoken =
    change.direction === "flat" ? "About the same as the previous 30 days" : `${change.direction === "up" ? "Up" : "Down"} ${change.text} vs the previous 30 days`;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-xs font-medium tabular-nums",
        change.good === true ? "bg-emerald-50 text-emerald-700" : change.good === false ? "bg-red-50 text-red-700" : "bg-zinc-100 text-zinc-600",
      )}
      title={spoken}
    >
      <Icon className="size-3" aria-hidden />
      <span aria-hidden>{change.text}</span>
      <span className="sr-only">{spoken}</span>
    </span>
  );
}

/** Same size as the real tiles, so nothing jumps when they load. */
export function PerformanceOverviewSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="flex flex-col gap-2 rounded-xl border bg-white p-4 shadow-xs">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-7 w-16" />
          <Skeleton className="h-3 w-20" />
        </div>
      ))}
    </div>
  );
}
