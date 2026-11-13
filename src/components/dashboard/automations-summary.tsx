import Link from "next/link";
import { ArrowRight, Workflow } from "lucide-react";
import { Glyph } from "@/components/brand/glyph";
import { Skeleton } from "@/components/ui/skeleton";
import { db } from "@/lib/db";
import { requireActiveWorkspace } from "@/lib/workspace";

// Small "Automations" card on the dashboard home: how many automations are
// switched on, and how many people are going through them right now.
// Render it inside <Suspense> (it reads the login cookie).

const numberFormat = new Intl.NumberFormat("en-US");

export async function AutomationsSummary() {
  // Checks login + workspace right next to the data; only THIS workspace's automations.
  const ws = await requireActiveWorkspace();
  const [total, active, inProgress] = await Promise.all([
    db.automation.count({ where: { workspaceId: ws.id } }),
    db.automation.count({ where: { workspaceId: ws.id, status: "ACTIVE" } }),
    // "In progress" = running a step now or waiting in a "wait" step
    // (the same rule the Automations page uses for its counts).
    db.automationRun.count({
      where: { automation: { workspaceId: ws.id }, status: { in: ["ACTIVE", "WAITING"] } },
    }),
  ]);

  if (total === 0) {
    return (
      <div className="flex h-full flex-col items-start gap-3 rounded-xl border border-dashed border-zinc-300 bg-white p-5">
        <Glyph icon={Workflow} size="lg" strokeWidth={1.5} />
        <div className="flex flex-col gap-1">
          <p className="font-medium text-zinc-900">No automations yet</p>
          <p className="text-sm text-zinc-500">Welcome new subscribers and more, on autopilot.</p>
        </div>
        <Link
          href="/automations/new"
          className="inline-flex items-center gap-1 text-sm font-medium text-emerald-700 hover:text-emerald-800"
        >
          Create an automation
          <ArrowRight className="size-4" aria-hidden />
        </Link>
      </div>
    );
  }

  return (
    <dl className="grid grid-cols-2 divide-x rounded-xl border bg-white shadow-xs lg:h-full lg:grid-cols-1 lg:divide-x-0 lg:divide-y">
      <Stat label="Active automations" value={active} sub={`of ${numberFormat.format(total)} in total`} />
      <Stat label="People in progress" value={inProgress} sub="Going through a flow now" />
    </dl>
  );
}

function Stat({ label, value, sub }: { label: string; value: number; sub: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 p-4 lg:p-5">
      <dt className="text-xs font-medium text-zinc-500">{label}</dt>
      <dd className="text-2xl font-semibold tracking-tight text-zinc-900 tabular-nums">{numberFormat.format(value)}</dd>
      <dd className="text-xs text-zinc-500">{sub}</dd>
    </div>
  );
}

/** Same size as the real card, so nothing jumps when it loads. */
export function AutomationsSummarySkeleton() {
  return (
    <div className="grid grid-cols-2 divide-x rounded-xl border bg-white shadow-xs lg:h-full lg:grid-cols-1 lg:divide-x-0 lg:divide-y">
      {[0, 1].map((i) => (
        <div key={i} className="flex flex-col gap-2 p-4 lg:p-5">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-7 w-12" />
          <Skeleton className="h-3 w-20" />
        </div>
      ))}
    </div>
  );
}

/** Section heading with the "View all" link. Static, so it renders immediately. */
export function AutomationsSummaryHeader() {
  return (
    <div className="flex items-center justify-between gap-4">
      <h2 id="automations-summary" className="text-lg font-semibold text-zinc-900">
        Automations
      </h2>
      <Link
        href="/automations"
        className="inline-flex items-center gap-1 text-sm font-medium text-emerald-700 hover:text-emerald-800"
      >
        View all
        <ArrowRight className="size-4" aria-hidden />
      </Link>
    </div>
  );
}
