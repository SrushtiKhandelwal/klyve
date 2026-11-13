import { cn } from "@/lib/utils";
import type { HealthStatus } from "@/lib/deliverability/thresholds";

// The traffic light used all over the Deliverability page.

export const STATUS_META: Record<HealthStatus, { label: string; dot: string; pill: string; border: string }> = {
  good: { label: "Healthy", dot: "bg-emerald-500", pill: "bg-emerald-50 text-emerald-700 ring-emerald-600/20", border: "border-emerald-200" },
  warning: { label: "Watch this", dot: "bg-amber-500", pill: "bg-amber-50 text-amber-800 ring-amber-600/20", border: "border-amber-200" },
  critical: { label: "Too high", dot: "bg-red-500", pill: "bg-red-50 text-red-700 ring-red-600/20", border: "border-red-200" },
  none: { label: "No data yet", dot: "bg-zinc-300", pill: "bg-zinc-100 text-zinc-600 ring-zinc-500/20", border: "border-zinc-200" },
};

export function StatusPill({ status, className }: { status: HealthStatus; className?: string }) {
  const meta = STATUS_META[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset",
        meta.pill,
        className,
      )}
    >
      <span aria-hidden className={cn("size-1.5 rounded-full", meta.dot)} />
      {meta.label}
    </span>
  );
}
