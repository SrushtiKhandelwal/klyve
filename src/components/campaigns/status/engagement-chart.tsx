"use client";

import { useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { useInBrowser } from "@/components/campaigns/local-time";
import { formatCount } from "@/components/campaigns/types";
import { cn } from "@/lib/utils";

// The engagement timeline: opens and clicks over time, as a small line chart.
//
// No chart library: the lines are an SVG stretched over the plot area
// (viewBox 0–100 with preserveAspectRatio="none", so x and y are simply
// percentages), and everything that must NOT stretch (axis labels, the hover
// dots, the tooltip) is ordinary HTML positioned with the same percentages.
//
// Accessibility: the picture has a text summary (aria-label), the exact
// numbers are in a real <table> under "View as table", and the hover readout
// also works with the keyboard (focus the chart, then use ← →).

export type ChartPoint = { t: string; opens: number; clicks: number };

type SeriesKey = "opens" | "clicks";
/** Same colours as the Opened/Clicked badges (emerald, violet); checked for colour-blind contrast. */
const SERIES: Record<SeriesKey, { label: string; color: string }> = {
  opens: { label: "Opens", color: "#059669" },
  clicks: { label: "Clicks", color: "#7c3aed" },
};

/** A round top value and evenly spaced ticks: 37 → top 40, ticks 0/10/20/30/40. */
function niceScale(max: number): { top: number; ticks: number[] } {
  if (max <= 0) return { top: 4, ticks: [0, 1, 2, 3, 4] };
  const rough = max / 4;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const norm = rough / magnitude;
  const step = Math.max(1, (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * magnitude);
  const top = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = 0; v <= top; v += step) ticks.push(v);
  return { top, ticks };
}

/** Which points get an x-axis label: about 5, always including the first and last. */
function labelIndexes(n: number): number[] {
  if (n <= 1) return [0];
  const step = Math.max(1, Math.ceil((n - 1) / 4));
  const out: number[] = [];
  for (let i = 0; i < n - 1; i += step) out.push(i);
  // Drop the one before the last if it would crowd it.
  if (out.length > 1 && n - 1 - out[out.length - 1] < step / 2) out.pop();
  out.push(n - 1);
  return out;
}

export function EngagementChart({
  hourly,
  daily,
  defaultView,
  showOpens,
  showClicks,
}: {
  hourly: ChartPoint[];
  daily: ChartPoint[];
  defaultView: "hourly" | "daily";
  showOpens: boolean;
  showClicks: boolean;
}) {
  const [view, setView] = useState(defaultView);
  const [active, setActive] = useState<number | null>(null);
  const plotRef = useRef<HTMLDivElement>(null);
  // Times are shown in the viewer's time zone once the page runs in the browser (UTC before).
  const local = useInBrowser();

  const points = view === "hourly" ? hourly : daily;
  const series = (["opens", "clicks"] as SeriesKey[]).filter((k) => (k === "opens" ? showOpens : showClicks));
  const n = points.length;
  const max = Math.max(0, ...points.flatMap((p) => series.map((k) => p[k])));
  const { top, ticks } = niceScale(max);
  const totals = Object.fromEntries(series.map((k) => [k, points.reduce((a, p) => a + p[k], 0)])) as Record<SeriesKey, number>;

  const x = (i: number) => (n <= 1 ? 50 : (i / (n - 1)) * 100);
  const y = (v: number) => 100 - (v / top) * 100;

  const fmt = (iso: string, opts: Intl.DateTimeFormatOptions) =>
    new Date(iso).toLocaleString(local ? undefined : "en-GB", local ? opts : { ...opts, timeZone: "UTC" });
  const dayMonth = (iso: string) => fmt(iso, { day: "numeric", month: "short" });
  const hourMinute = (iso: string) => fmt(iso, { hour: "2-digit", minute: "2-digit" });
  /** Full description of one point, for the tooltip and the table. */
  const pointLabel = (i: number) =>
    view === "hourly"
      ? `${dayMonth(points[i].t)}, ${hourMinute(points[i].t)}`
      : `Day ${i + 1} (from ${dayMonth(points[i].t)}, ${hourMinute(points[i].t)})`;

  const busiest = series.length
    ? points.reduce((best, p, i) => (p[series[0]] > points[best][series[0]] ? i : best), 0)
    : 0;
  const summary =
    series.length === 0
      ? "No tracking data"
      : `Line chart of ${series.map((k) => SERIES[k].label.toLowerCase()).join(" and ")} ${
          view === "hourly" ? "per hour for the first 48 hours" : "per day for the first 30 days"
        }: ${series.map((k) => `${formatCount(totals[k])} ${SERIES[k].label.toLowerCase()}`).join(", ")} in total${
          max > 0 ? `, busiest ${view === "hourly" ? "hour" : "day"} ${pointLabel(busiest)}` : ""
        }. Exact numbers are in the table below.`;

  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    const rect = plotRef.current?.getBoundingClientRect();
    if (!rect || n === 0) return;
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    setActive(n <= 1 ? 0 : Math.round(ratio * (n - 1)));
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (n === 0) return;
    const current = active ?? 0;
    const next =
      e.key === "ArrowRight" ? Math.min(n - 1, current + 1)
      : e.key === "ArrowLeft" ? Math.max(0, current - 1)
      : e.key === "Home" ? 0
      : e.key === "End" ? n - 1
      : null;
    if (next === null) return;
    e.preventDefault();
    setActive(next);
  }

  const linePoints = (k: SeriesKey) => points.map((p, i) => `${x(i)},${y(p[k])}`).join(" ");
  const activeX = active !== null ? x(active) : 0;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Legend: a short line in the series colour; the text stays dark for contrast. */}
        <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-zinc-600">
          {series.map((k) => (
            <li key={k} className="flex items-center gap-1.5">
              <span className="h-0.5 w-4 rounded-full" style={{ background: SERIES[k].color }} aria-hidden />
              {SERIES[k].label}
              <span className="font-medium text-zinc-900 tabular-nums">{formatCount(totals[k])}</span>
            </li>
          ))}
        </ul>
        <div className="inline-flex rounded-lg border bg-zinc-50 p-0.5 text-xs font-medium" role="group" aria-label="Time range">
          {(
            [
              ["hourly", "First 48 hours"],
              ["daily", "30 days"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={view === value}
              onClick={() => {
                setView(value);
                setActive(null);
              }}
              className={cn(
                "rounded-md px-2.5 py-1 outline-none focus-visible:ring-3 focus-visible:ring-emerald-500/40",
                view === value ? "bg-white text-zinc-900 shadow-xs" : "text-zinc-500 hover:text-zinc-800",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-2">
        {/* Y axis labels (HTML, so the text never stretches). */}
        <div className="relative h-44 w-8 shrink-0 text-right text-[11px] text-zinc-500 tabular-nums sm:h-52" aria-hidden>
          {ticks.map((t) => (
            <span key={t} className="absolute right-0 -translate-y-1/2 leading-none" style={{ top: `${y(t)}%` }}>
              {formatCount(t)}
            </span>
          ))}
        </div>

        <div
          ref={plotRef}
          role="img"
          aria-label={summary}
          tabIndex={0}
          onPointerMove={onPointerMove}
          onPointerLeave={() => setActive(null)}
          onFocus={() => setActive((a) => a ?? (max > 0 ? busiest : 0))}
          onBlur={() => setActive(null)}
          onKeyDown={onKeyDown}
          className="relative h-44 min-w-0 flex-1 touch-pan-y rounded-sm outline-none focus-visible:ring-3 focus-visible:ring-emerald-500/40 sm:h-52"
        >
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible" aria-hidden>
            {/* Recessive grid: thin, light lines at each tick. */}
            {ticks.map((t) => (
              <line key={t} x1={0} x2={100} y1={y(t)} y2={y(t)} stroke={t === 0 ? "#d4d4d8" : "#f4f4f5"} strokeWidth={1} vectorEffect="non-scaling-stroke" />
            ))}
            {/* A soft area under the opens line helps it read as "the main one". */}
            {series.includes("opens") && n > 1 && (
              <polygon points={`0,100 ${linePoints("opens")} 100,100`} fill={SERIES.opens.color} fillOpacity={0.08} />
            )}
            {n > 1 &&
              series.map((k) => (
                <polyline
                  key={k}
                  points={linePoints(k)}
                  fill="none"
                  stroke={SERIES[k].color}
                  strokeWidth={2}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  vectorEffect="non-scaling-stroke"
                />
              ))}
          </svg>

          {/* With a single point there's no line to draw, so show dots instead. */}
          {n === 1 &&
            series.map((k) => <Dot key={k} left={x(0)} top={y(points[0][k])} color={SERIES[k].color} />)}

          {max === 0 && (
            <p className="absolute inset-0 flex items-center justify-center text-sm text-zinc-400">No opens or clicks yet</p>
          )}

          {active !== null && points[active] && (
            <>
              {/* Crosshair + a dot on each line at the hovered time. */}
              <div className="pointer-events-none absolute inset-y-0 w-px bg-zinc-300" style={{ left: `${activeX}%` }} aria-hidden />
              {series.map((k) => (
                <Dot key={k} left={activeX} top={y(points[active][k])} color={SERIES[k].color} />
              ))}
              <div
                className="pointer-events-none absolute top-0 z-10 min-w-36 rounded-lg border bg-white px-3 py-2 text-xs shadow-md"
                style={{
                  left: `${activeX}%`,
                  // Keep the box inside the chart near the edges.
                  transform: `translateX(${activeX < 20 ? "8px" : activeX > 80 ? "calc(-100% - 8px)" : "-50%"})`,
                }}
                aria-hidden
              >
                <p className="mb-1 text-zinc-500">{pointLabel(active)}</p>
                {series.map((k) => (
                  <p key={k} className="flex items-center gap-2">
                    <span className="h-0.5 w-3 rounded-full" style={{ background: SERIES[k].color }} />
                    <span className="font-semibold text-zinc-900 tabular-nums">{formatCount(points[active][k])}</span>
                    <span className="text-zinc-500">{SERIES[k].label.toLowerCase()}</span>
                  </p>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* X axis labels: time of day (and the date when it changes) or the day number. */}
      <div className="relative ml-10 h-8 text-[11px] leading-tight text-zinc-500" aria-hidden>
        {labelIndexes(n).map((i, idx, all) => {
          const prev = idx > 0 ? all[idx - 1] : null;
          const newDate = prev === null || dayMonth(points[prev].t) !== dayMonth(points[i].t);
          return (
            <span
              key={i}
              className={cn(
                "absolute top-1 whitespace-nowrap",
                n <= 1 ? "-translate-x-1/2 text-center" : i === 0 ? "text-left" : i === n - 1 ? "-translate-x-full text-right" : "-translate-x-1/2 text-center",
              )}
              style={{ left: `${x(i)}%` }}
            >
              {view === "hourly" ? (
                <>
                  {hourMinute(points[i].t)}
                  {newDate && <span className="block">{dayMonth(points[i].t)}</span>}
                </>
              ) : (
                <>
                  Day {i + 1}
                  <span className="block">{dayMonth(points[i].t)}</span>
                </>
              )}
            </span>
          );
        })}
      </div>

      <details className="group text-sm">
        <summary className="w-fit cursor-pointer text-xs font-medium text-zinc-500 hover:text-zinc-800">View as table</summary>
        <div className="mt-2 max-h-72 overflow-auto rounded-lg border">
          <table className="w-full text-left text-xs">
            <caption className="sr-only">{summary}</caption>
            <thead className="sticky top-0 bg-zinc-50 text-zinc-500">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">
                  {view === "hourly" ? "Hour starting" : "Day"}
                </th>
                {series.map((k) => (
                  <th key={k} scope="col" className="px-3 py-2 text-right font-medium">
                    {SERIES[k].label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {points.map((p, i) => (
                <tr key={p.t}>
                  <th scope="row" className="px-3 py-1.5 font-normal text-zinc-700">
                    {pointLabel(i)}
                  </th>
                  {series.map((k) => (
                    <td key={k} className="px-3 py-1.5 text-right text-zinc-900 tabular-nums">
                      {formatCount(p[k])}
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

/** A round marker (HTML, so it stays round however the chart is stretched). */
function Dot({ left, top, color }: { left: number; top: number; color: string }) {
  return (
    <span
      className="pointer-events-none absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-white"
      style={{ left: `${left}%`, top: `${top}%`, background: color }}
      aria-hidden
    />
  );
}
