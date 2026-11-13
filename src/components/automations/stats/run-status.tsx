import { cn } from "@/lib/utils";

// How a run's status looks everywhere (automation stats, contact page).
// Safe on server and client.

export type RunStatusValue = "ACTIVE" | "WAITING" | "COMPLETED" | "EXITED" | "FAILED";

export const RUN_STATUS_META: Record<RunStatusValue, { label: string; help: string; className: string; bar: string }> = {
  ACTIVE: {
    label: "In progress",
    help: "About to run their next step.",
    className: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
    bar: "bg-emerald-600",
  },
  WAITING: {
    label: "Waiting",
    help: "In a “Wait” step until it's time for the next one.",
    className: "bg-sky-50 text-sky-700 ring-sky-600/20",
    bar: "bg-sky-500",
  },
  COMPLETED: {
    label: "Completed",
    help: "Went all the way to the end.",
    className: "bg-zinc-100 text-zinc-700 ring-zinc-500/20",
    bar: "bg-zinc-400",
  },
  EXITED: {
    label: "Left early",
    help: "Unsubscribed, removed by hand, reached an Exit step…",
    className: "bg-amber-50 text-amber-700 ring-amber-600/20",
    bar: "bg-amber-500",
  },
  FAILED: {
    label: "Failed",
    help: "A step couldn't run.",
    className: "bg-red-50 text-red-700 ring-red-600/20",
    bar: "bg-red-500",
  },
};

export function RunStatusBadge({ status, className }: { status: RunStatusValue; className?: string }) {
  const meta = RUN_STATUS_META[status];
  return (
    <span
      title={meta.help}
      className={cn("inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset", meta.className, className)}
    >
      {meta.label}
    </span>
  );
}
