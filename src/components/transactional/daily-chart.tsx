import { dayLabel as statsDayLabel, labelStep } from "@/components/statistics/chart-utils";
import type { TransactionalStatusName } from "@/lib/transactional/schema";
import { cn } from "@/lib/utils";

// Emails per day as a small stacked bar chart (same no-library approach as
// the form sign-ups chart): each bar is a <div> whose height is a percentage
// of the busiest day, so it needs no JavaScript and fits any screen width.
// Hovering a bar shows its exact numbers; the same numbers are in a real
// <table> under "View as table" for screen readers.
// Works for 7 days (the logs page) up to a year (Transactional → Statistics):
// with many days the bars get thinner and only some days are labelled.

type Day = { day: string; total: number; byStatus: Record<TransactionalStatusName, number> };

/** The stacked parts of each bar, bottom to top. */
const PARTS = [
  { key: "sent", label: "Sent", color: "bg-emerald-500", statuses: ["SENT"] },
  { key: "waiting", label: "Queued", color: "bg-zinc-300", statuses: ["QUEUED", "SENDING"] },
  { key: "suppressed", label: "Suppressed", color: "bg-violet-400", statuses: ["SUPPRESSED"] },
  { key: "problem", label: "Failed or bounced", color: "bg-red-500", statuses: ["FAILED", "BOUNCED", "COMPLAINED"] },
] as const satisfies readonly { key: string; label: string; color: string; statuses: readonly TransactionalStatusName[] }[];

const sum = (d: Day, statuses: readonly TransactionalStatusName[]) => statuses.reduce((n, s) => n + (d.byStatus[s] ?? 0), 0);

/** A round top value for the y axis: 7 → 8, 37 → 40, 0 → 4. */
function niceTop(max: number): number {
  if (max <= 4) return 4;
  const magnitude = 10 ** Math.floor(Math.log10(max));
  for (const step of [1, 2, 2.5, 5, 10]) {
    if (step * magnitude >= max) return step * magnitude;
  }
  return 10 * magnitude;
}

/** "2026-11-13" → "Fri 13 Nov" (the key is already a calendar day, so format it in UTC). */
const dayLabel = (date: string, weekday = true) => statsDayLabel(date, { weekday });

const fmt = (n: number) => n.toLocaleString("en");

export function DailyChart({ daily, zoneLabel = "UTC" }: { daily: Day[]; /** The time zone the days are in. */ zoneLabel?: string }) {
  const step = labelStep(daily.length);
  const dense = daily.length > 31;
  const max = Math.max(0, ...daily.map((d) => d.total));
  const top = niceTop(max);
  const total = daily.reduce((n, d) => n + d.total, 0);
  const summary =
    `Stacked bar chart of transactional emails per day for ${daily.length} days: ${fmt(total)} in total. ` +
    "Exact numbers are in the table below.";

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <div className="relative h-32 w-7 shrink-0 text-right text-[11px] text-zinc-500 tabular-nums" aria-hidden>
          {[0, top / 2, top].map((t) => (
            <span key={t} className="absolute right-0 -translate-y-1/2 leading-none" style={{ top: `${100 - (t / top) * 100}%` }}>
              {fmt(t)}
            </span>
          ))}
        </div>
        <div role="img" aria-label={summary} className="relative h-32 min-w-0 flex-1">
          {[0, top / 2, top].map((t) => (
            <div
              key={t}
              aria-hidden
              className={t === 0 ? "absolute inset-x-0 h-px bg-zinc-300" : "absolute inset-x-0 h-px bg-zinc-100"}
              style={{ top: `${100 - (t / top) * 100}%` }}
            />
          ))}
          <div className={cn("absolute inset-0 flex items-end", dense ? "gap-px" : daily.length > 10 ? "gap-0.5 sm:gap-1" : "gap-1.5 sm:gap-3")} aria-hidden>
            {daily.map((d) => (
              <div
                key={d.day}
                title={`${dayLabel(d.day)}: ${fmt(d.total)} email${d.total === 1 ? "" : "s"}${PARTS.map((p) => {
                  const n = sum(d, p.statuses);
                  return n ? `\n${p.label}: ${fmt(n)}` : "";
                }).join("")}`}
                className="group flex h-full min-w-0 flex-1 flex-col justify-end hover:bg-zinc-50"
              >
                {/* Each part's height is its share of the y axis; column-reverse puts "Sent" at the bottom. */}
                <div className={cn("flex w-full flex-col-reverse overflow-hidden group-hover:opacity-85", dense ? "rounded-t-[1px]" : "rounded-t-[3px]")} style={{ height: d.total ? `max(2px, ${(d.total / top) * 100}%)` : 0 }}>
                  {PARTS.map((p) => {
                    const n = sum(d, p.statuses);
                    return n ? <div key={p.key} className={p.color} style={{ height: `${(n / d.total) * 100}%` }} /> : null;
                  })}
                </div>
              </div>
            ))}
          </div>
          {max === 0 && <p className="absolute inset-0 flex items-center justify-center text-sm text-zinc-400">No emails in this period</p>}
        </div>
      </div>

      <div
        className={cn("ml-9 flex h-4 text-[11px] text-zinc-500", dense ? "gap-px" : daily.length > 10 ? "gap-0.5 sm:gap-1" : "gap-1.5 sm:gap-3")}
        aria-hidden
      >
        {daily.map((d, i) =>
          step === 1 ? (
            <span key={d.day} className="min-w-0 flex-1 truncate text-center">
              {dayLabel(d.day, false)}
            </span>
          ) : (
            // Only every few days: centred under its bar, allowed to be wider than it.
            <span key={d.day} className="relative min-w-0 flex-1">
              {i % step === 0 && <span className="absolute left-1/2 -translate-x-1/2 whitespace-nowrap">{dayLabel(d.day, false)}</span>}
            </span>
          ),
        )}
      </div>

      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-600" aria-hidden>
        {PARTS.map((p) => (
          <span key={p.key} className="flex items-center gap-1.5">
            <span className={`size-2.5 rounded-sm ${p.color}`} />
            {p.label}
          </span>
        ))}
      </div>

      <details className="mt-2 text-sm">
        <summary className="w-fit cursor-pointer text-xs font-medium text-zinc-500 hover:text-zinc-800">View as table</summary>
        <div className="mt-2 max-h-72 overflow-auto rounded-lg border">
          <table className="w-full text-left text-xs">
            <caption className="sr-only">Transactional emails per day ({zoneLabel})</caption>
            <thead className="sticky top-0 bg-zinc-50 text-zinc-500">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">
                  Day ({zoneLabel})
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  Total
                </th>
                {PARTS.map((p) => (
                  <th key={p.key} scope="col" className="px-3 py-2 text-right font-medium">
                    {p.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {[...daily].reverse().map((d) => (
                <tr key={d.day}>
                  <th scope="row" className="px-3 py-1.5 font-normal whitespace-nowrap text-zinc-700">
                    {dayLabel(d.day)}
                  </th>
                  <td className="px-3 py-1.5 text-right text-zinc-900 tabular-nums">{fmt(d.total)}</td>
                  {PARTS.map((p) => (
                    <td key={p.key} className="px-3 py-1.5 text-right text-zinc-900 tabular-nums">
                      {fmt(sum(d, p.statuses))}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
