import { dayAfter, isDayKey } from "@/lib/format-date";

// The date range of the statistics pages, read from the URL:
//
//   ?range=7 | 30 | 90                    the last N days, today included
//   ?range=custom&from=2026-10-01&to=2026-10-31
//   &automation=0                         leave automation emails out (marketing only)
//
// Days are calendar days in the WORKSPACE time zone (Settings → General), so
// "today" for a team in India starts at midnight in India, not in London.
// Pure functions: safe on the server and in the browser.

export const RANGE_PRESETS = [7, 30, 90] as const;
export type RangePreset = "7" | "30" | "90" | "custom";

/** The longest range we work out at once (a year, leap day included). */
export const MAX_RANGE_DAYS = 366;
export const DEFAULT_PRESET = 30;

export type StatsRange = {
  /** First and last day, "YYYY-MM-DD", both included. */
  from: string;
  to: string;
  /** How many days that is (1–366). */
  days: number;
  preset: RangePreset;
};

const DAY_MS = 86_400_000;
const keyToUtc = (key: string) => Date.UTC(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1, Number(key.slice(8, 10)));
const utcToKey = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** "2026-11-14" minus 6 days → "2026-11-08". */
export function addDays(key: string, days: number): string {
  return utcToKey(keyToUtc(key) + days * DAY_MS);
}

/** Days from `from` to `to`, both included ("2026-11-01".."2026-11-01" = 1). */
export function daysBetween(from: string, to: string): number {
  return Math.round((keyToUtc(to) - keyToUtc(from)) / DAY_MS) + 1;
}

/** Every day key from `from` to `to`, oldest first. */
export function eachDay(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to && out.length < MAX_RANGE_DAYS + 1; d = dayAfter(d)) out.push(d);
  return out;
}

/** The last `n` days up to `today`. */
export function presetRange(n: number, today: string): StatsRange {
  return { from: addDays(today, -(n - 1)), to: today, days: n, preset: String(n) as RangePreset };
}

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

/**
 * Reads the range from the URL. Anything odd is fixed rather than rejected:
 * dates the wrong way round are swapped, a future end becomes today, and a
 * range longer than a year is shortened to the last 366 days of it.
 */
export function parseStatsRange(sp: Record<string, string | string[] | undefined>, today: string): StatsRange {
  const range = first(sp.range);
  if (range === "custom") {
    let from = first(sp.from);
    let to = first(sp.to);
    if (isDayKey(from) && isDayKey(to)) {
      if (from > to) [from, to] = [to, from];
      if (to > today) to = today;
      if (from > to) from = to;
      if (daysBetween(from, to) > MAX_RANGE_DAYS) from = addDays(to, -(MAX_RANGE_DAYS - 1));
      return { from, to, days: daysBetween(from, to), preset: "custom" };
    }
  }
  const n = RANGE_PRESETS.find((p) => String(p) === range) ?? DEFAULT_PRESET;
  return presetRange(n, today);
}

/** ?automation=0 → false. Automation emails are included unless switched off. */
export function parseIncludeAutomation(sp: Record<string, string | string[] | undefined>): boolean {
  return first(sp.automation) !== "0";
}

/** The query string for a range (and the automation switch), e.g. "range=7". */
export function rangeSearch(range: Pick<StatsRange, "from" | "to" | "preset">, includeAutomation?: boolean): string {
  const params = new URLSearchParams();
  if (range.preset === "custom") {
    params.set("range", "custom");
    params.set("from", range.from);
    params.set("to", range.to);
  } else {
    params.set("range", range.preset);
  }
  if (includeAutomation === false) params.set("automation", "0");
  return params.toString();
}
