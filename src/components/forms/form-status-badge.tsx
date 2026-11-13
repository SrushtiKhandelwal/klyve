import { cn } from "@/lib/utils";

// "Active" (green, with a dot) or "Paused" (grey) pill for a sign-up form.

export function FormStatusBadge({ status, className }: { status: "ACTIVE" | "PAUSED"; className?: string }) {
  const active = status === "ACTIVE";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset",
        active ? "bg-emerald-50 text-emerald-700 ring-emerald-600/20" : "bg-zinc-100 text-zinc-600 ring-zinc-500/20",
        className,
      )}
    >
      <span className={cn("size-1.5 rounded-full", active ? "bg-emerald-500" : "bg-zinc-400")} aria-hidden />
      {active ? "Active" : "Paused"}
    </span>
  );
}
