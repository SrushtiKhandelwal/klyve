import { cn } from "@/lib/utils";
import { dayLabel, fmt, labelStep, niceTop } from "./chart-utils";

// One number per day as a bar chart (emerald bars on a light grid). Each bar
// is a <div> whose height is a percentage of the y axis, so it needs no chart
// library and no JavaScript. Hovering a day shows its exact number; the same
// numbers are in a real <table> under "View as table" for screen readers.

export type DailyPoint = { day: string; value: number };

export function DailyBarChart({
  data,
  label,
  unit,
  zoneLabel,
}: {
  data: DailyPoint[];
  /** What is counted, e.g. "Emails sent" (used in the summary and the table). */
  label: string;
  /** Singular / plural for the hover text, e.g. ["email", "emails"]. */
  unit: [string, string];
  /** The time zone the days are in, e.g. "Asia/Kolkata". */
  zoneLabel: string;
}) {
  const max = Math.max(0, ...data.map((d) => d.value));
  const top = niceTop(max);
  const total = data.reduce((n, d) => n + d.value, 0);
  const step = labelStep(data.length);
  const dense = data.length > 31;
  const summary = `Bar chart of ${label.toLowerCase()} per day for ${data.length} days: ${fmt(total)} in total, at most ${fmt(max)} on one day. Exact numbers are in the table below.`;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <div className="relative h-40 w-9 shrink-0 text-right text-[11px] text-zinc-500 tabular-nums" aria-hidden>
          {[0, top / 2, top].map((t) => (
            <span key={t} className="absolute right-0 -translate-y-1/2 leading-none" style={{ top: `${100 - (t / top) * 100}%` }}>
              {fmt(t)}
            </span>
          ))}
        </div>
        <div role="img" aria-label={summary} className="relative h-40 min-w-0 flex-1">
          {[0, top / 2, top].map((t) => (
            <div
              key={t}
              aria-hidden
              className={t === 0 ? "absolute inset-x-0 h-px bg-zinc-300" : "absolute inset-x-0 h-px bg-zinc-100"}
              style={{ top: `${100 - (t / top) * 100}%` }}
            />
          ))}
          <div className={cn("absolute inset-0 flex items-end", dense ? "gap-px" : "gap-0.5 sm:gap-1")} aria-hidden>
            {data.map((d) => (
              // The whole column is the hover target, not just the (maybe tiny) bar.
              <div
                key={d.day}
                title={`${dayLabel(d.day, { weekday: true })}: ${fmt(d.value)} ${d.value === 1 ? unit[0] : unit[1]}`}
                className="group flex h-full min-w-0 flex-1 flex-col justify-end hover:bg-zinc-50"
              >
                <div
                  className={cn("w-full bg-emerald-500 group-hover:bg-emerald-600", dense ? "rounded-t-[1px]" : "rounded-t-[3px]")}
                  style={{ height: d.value ? `max(2px, ${(d.value / top) * 100}%)` : 0 }}
                />
              </div>
            ))}
          </div>
          {max === 0 && <p className="absolute inset-0 flex items-center justify-center text-sm text-zinc-400">Nothing in this period</p>}
        </div>
      </div>

      <div className={cn("ml-11 flex h-4 text-[11px] text-zinc-500", dense ? "gap-px" : "gap-0.5 sm:gap-1")} aria-hidden>
        {data.map((d, i) => (
          <span key={d.day} className="relative min-w-0 flex-1">
            {i % step === 0 && <span className="absolute left-1/2 -translate-x-1/2 whitespace-nowrap">{dayLabel(d.day)}</span>}
          </span>
        ))}
      </div>

      <details className="mt-2 text-sm">
        <summary className="w-fit cursor-pointer text-xs font-medium text-zinc-500 hover:text-zinc-800">View as table</summary>
        <div className="mt-2 max-h-72 overflow-auto rounded-lg border">
          <table className="w-full text-left text-xs">
            <caption className="sr-only">
              {label} per day ({zoneLabel})
            </caption>
            <thead className="sticky top-0 bg-zinc-50 text-zinc-500">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">
                  Day ({zoneLabel})
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  {label}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {[...data].reverse().map((d) => (
                <tr key={d.day}>
                  <th scope="row" className="px-3 py-1.5 font-normal whitespace-nowrap text-zinc-700">
                    {dayLabel(d.day, { weekday: true, year: true })}
                  </th>
                  <td className="px-3 py-1.5 text-right text-zinc-900 tabular-nums">{fmt(d.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
