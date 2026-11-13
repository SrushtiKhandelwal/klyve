import { formatCount } from "@/components/campaigns/types";
import type { DailyPoint } from "@/lib/forms/stats";

// Sign-ups per day as a simple bar chart.
//
// No chart library: each bar is a <div> whose height is a percentage of the
// tallest day, so it stretches nicely from phones to wide screens and needs
// no JavaScript (it renders on the server). Hovering a bar shows its exact
// numbers (the browser's own tooltip, from `title`).
//
// Accessibility: the chart has a one-sentence summary (aria-label) and the
// exact numbers are in a real <table> under "View as table".

/** A round top value for the y axis: 7 → 8, 37 → 40, 0 → 4. */
function niceTop(max: number): number {
  if (max <= 4) return 4;
  const magnitude = 10 ** Math.floor(Math.log10(max));
  for (const step of [1, 2, 2.5, 5, 10]) {
    const top = step * magnitude;
    if (top >= max) return top;
  }
  return 10 * magnitude;
}

/** "2026-11-13" → "13 Nov" (the day is a UTC day, so format it in UTC). */
function dayLabel(date: string, withWeekday = false): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    ...(withWeekday ? { weekday: "short" } : {}),
    timeZone: "UTC",
  });
}

export function SignupsChart({ daily }: { daily: DailyPoint[] }) {
  const n = daily.length;
  const max = Math.max(0, ...daily.map((d) => d.signups));
  const top = niceTop(max);
  const ticks = [0, top / 2, top];
  const total = daily.reduce((sum, d) => sum + d.signups, 0);
  const busiest = daily.reduce((best, d) => (d.signups > best.signups ? d : best), daily[0] ?? { date: "", signups: 0, other: 0, spam: 0 });

  const summary =
    n === 0
      ? "No data"
      : `Bar chart of sign-ups per day for the last ${n} days: ${formatCount(total)} in total` +
        (max > 0 ? `, busiest day ${dayLabel(busiest.date)} with ${formatCount(busiest.signups)}` : "") +
        ". Exact numbers are in the table below.";

  // About five date labels under the chart: first, last and a few between.
  const labelEvery = Math.max(1, Math.ceil(n / 5));

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        {/* Y axis labels */}
        <div className="relative h-40 w-7 shrink-0 text-right text-[11px] text-zinc-500 tabular-nums sm:h-48" aria-hidden>
          {ticks.map((t) => (
            <span key={t} className="absolute right-0 -translate-y-1/2 leading-none" style={{ top: `${100 - (t / top) * 100}%` }}>
              {formatCount(t)}
            </span>
          ))}
        </div>

        <div role="img" aria-label={summary} className="relative h-40 min-w-0 flex-1 sm:h-48">
          {/* Light grid lines at each tick. */}
          {ticks.map((t) => (
            <div
              key={t}
              aria-hidden
              className={t === 0 ? "absolute inset-x-0 h-px bg-zinc-300" : "absolute inset-x-0 h-px bg-zinc-100"}
              style={{ top: `${100 - (t / top) * 100}%` }}
            />
          ))}
          <div className="absolute inset-0 flex items-end gap-px sm:gap-0.5" aria-hidden>
            {daily.map((d) => (
              <div
                key={d.date}
                title={`${dayLabel(d.date, true)}: ${formatCount(d.signups)} sign-up${d.signups === 1 ? "" : "s"}${
                  d.spam ? `, ${formatCount(d.spam)} spam blocked` : ""
                }`}
                className="group flex h-full min-w-0 flex-1 items-end"
              >
                <div
                  className="w-full rounded-t-[3px] bg-emerald-600 transition-colors group-hover:bg-emerald-700"
                  // A 0-day gets no bar at all; any other day at least a sliver, so 1 sign-up is visible.
                  style={{ height: d.signups === 0 ? 0 : `max(2px, ${(d.signups / top) * 100}%)` }}
                />
              </div>
            ))}
          </div>
          {max === 0 && (
            <p className="absolute inset-0 flex items-center justify-center text-sm text-zinc-400">No sign-ups in this period</p>
          )}
        </div>
      </div>

      {/* X axis: a handful of dates. */}
      <div className="ml-9 flex text-[11px] text-zinc-500" aria-hidden>
        {daily.map((d, i) => (
          <span key={d.date} className="relative min-w-0 flex-1">
            {(i % labelEvery === 0 || i === n - 1) && (i === n - 1 || n - 1 - i >= labelEvery / 2) && (
              <span className={i === n - 1 ? "absolute right-0 whitespace-nowrap" : "absolute left-0 whitespace-nowrap"}>
                {dayLabel(d.date)}
              </span>
            )}
          </span>
        ))}
      </div>

      <details className="mt-4 text-sm">
        <summary className="w-fit cursor-pointer text-xs font-medium text-zinc-500 hover:text-zinc-800">View as table</summary>
        <div className="mt-2 max-h-72 overflow-auto rounded-lg border">
          <table className="w-full text-left text-xs">
            <caption className="sr-only">Form submissions per day (UTC)</caption>
            <thead className="sticky top-0 bg-zinc-50 text-zinc-500">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">
                  Day (UTC)
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  Sign-ups
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  Not added
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  Spam blocked
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {[...daily].reverse().map((d) => (
                <tr key={d.date}>
                  <th scope="row" className="px-3 py-1.5 font-normal text-zinc-700">
                    {dayLabel(d.date, true)}
                  </th>
                  <td className="px-3 py-1.5 text-right text-zinc-900 tabular-nums">{formatCount(d.signups)}</td>
                  <td className="px-3 py-1.5 text-right text-zinc-900 tabular-nums">{formatCount(d.other)}</td>
                  <td className="px-3 py-1.5 text-right text-zinc-900 tabular-nums">{formatCount(d.spam)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
