import { cn } from "@/lib/utils";

// A labelled progress bar: "37 of 100 requests used". Turns amber near the
// limit and red when it's used up. Plain markup, so it works on the server.

export function UsageMeter({ label, used, limit, note }: { label: string; used: number; limit: number; note: string }) {
  const ratio = limit > 0 ? Math.min(1, used / limit) : 1;
  const full = used >= limit;
  const tone = full ? "bg-red-500" : ratio >= 0.8 ? "bg-amber-500" : "bg-emerald-600";
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm font-medium text-zinc-900">{label}</p>
        <p className="text-sm text-zinc-600 tabular-nums">
          <span className="font-semibold text-zinc-900">{used.toLocaleString("en-US")}</span> of {limit.toLocaleString("en-US")}
        </p>
      </div>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={limit}
        aria-valuenow={Math.min(used, limit)}
        className="h-2 overflow-hidden rounded-full bg-zinc-100"
      >
        <div className={cn("h-full rounded-full transition-all", tone)} style={{ width: `${Math.round(ratio * 100)}%` }} />
      </div>
      <p className={cn("text-xs", full ? "text-red-700" : "text-zinc-500")}>{note}</p>
    </div>
  );
}
