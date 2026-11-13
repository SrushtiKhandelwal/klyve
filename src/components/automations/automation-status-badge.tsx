import { cn } from "@/lib/utils";

// "Draft" (grey), "Active" (green, with a pulsing dot) or "Paused" (amber) pill.

const STYLES = {
  DRAFT: { label: "Draft", pill: "bg-zinc-100 text-zinc-600 ring-zinc-500/20", dot: "bg-zinc-400" },
  ACTIVE: { label: "Active", pill: "bg-emerald-50 text-emerald-700 ring-emerald-600/20", dot: "bg-emerald-500" },
  PAUSED: { label: "Paused", pill: "bg-amber-50 text-amber-700 ring-amber-600/20", dot: "bg-amber-500" },
} as const;

export function AutomationStatusBadge({ status, className }: { status: keyof typeof STYLES; className?: string }) {
  const style = STYLES[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset",
        style.pill,
        className,
      )}
    >
      <span className={cn("size-1.5 rounded-full", style.dot, status === "ACTIVE" && "animate-pulse")} aria-hidden />
      {style.label}
    </span>
  );
}
