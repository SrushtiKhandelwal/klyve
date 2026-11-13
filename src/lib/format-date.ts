// Date and time formatting that follows the workspace's General settings
// (time zone, date format, 12/24-hour clock). Pure functions: safe to use in
// Server Components, Client Components and the worker alike.
//
// Because the time zone comes from the workspace (not the viewer's browser),
// the server and the browser render exactly the same text, so there is no
// hydration flicker.

export type DateFormat = "DMY" | "MDY" | "YMD";
export type TimeFormat = "24h" | "12h";
export type DatePrefs = { timezone: string; dateFormat: DateFormat; timeFormat: TimeFormat };

export const DEFAULT_DATE_PREFS: DatePrefs = { timezone: "UTC", dateFormat: "DMY", timeFormat: "24h" };

export const DATE_FORMAT_OPTIONS: { value: DateFormat; label: string }[] = [
  { value: "DMY", label: "14 Nov 2026" },
  { value: "MDY", label: "Nov 14, 2026" },
  { value: "YMD", label: "2026-11-14" },
];

export const TIME_FORMAT_OPTIONS: { value: TimeFormat; label: string }[] = [
  { value: "24h", label: "24-hour (17:30)" },
  { value: "12h", label: "12-hour (5:30 PM)" },
];

/** True for a time zone name the runtime knows, e.g. "Asia/Kolkata". */
export function isValidTimeZone(timezone: string): boolean {
  if (!timezone || timezone.length > 64) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

/** All time zones the runtime knows (for a picker). */
export function listTimeZones(): string[] {
  const supported = (Intl as unknown as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf;
  const zones = supported ? supported("timeZone") : [];
  return zones.includes("UTC") ? zones : ["UTC", ...zones];
}

/** Turns whatever is stored in the database into safe, complete prefs. */
export function normalizeDatePrefs(raw: { timezone?: string | null; dateFormat?: string | null; timeFormat?: string | null } | null | undefined): DatePrefs {
  const timezone = raw?.timezone && isValidTimeZone(raw.timezone) ? raw.timezone : DEFAULT_DATE_PREFS.timezone;
  const dateFormat: DateFormat = raw?.dateFormat === "MDY" || raw?.dateFormat === "YMD" ? raw.dateFormat : "DMY";
  const timeFormat: TimeFormat = raw?.timeFormat === "12h" ? "12h" : "24h";
  return { timezone, dateFormat, timeFormat };
}

type Parts = { year: string; month: string; day: string; monthShort: string; hour: string; minute: string; dayPeriod: string };

function parts(date: Date, prefs: DatePrefs): Parts {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: prefs.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: prefs.timeFormat === "12h",
  });
  const out: Record<string, string> = {};
  for (const p of fmt.formatToParts(date)) out[p.type] = p.value;
  const monthShort = new Intl.DateTimeFormat("en-US", { timeZone: prefs.timezone, month: "short" }).format(date);
  // Some runtimes print midnight as "24" in 24-hour mode.
  const hour = out.hour === "24" ? "00" : out.hour;
  return { year: out.year, month: out.month, day: out.day, monthShort, hour, minute: out.minute, dayPeriod: out.dayPeriod ?? "" };
}

/** "14 Nov 2026" / "Nov 14, 2026" / "2026-11-14" in the workspace time zone. */
export function formatDate(date: Date | string, prefs: DatePrefs = DEFAULT_DATE_PREFS): string {
  const p = parts(new Date(date), prefs);
  const day = String(Number(p.day));
  if (prefs.dateFormat === "MDY") return `${p.monthShort} ${day}, ${p.year}`;
  if (prefs.dateFormat === "YMD") return `${p.year}-${p.month}-${p.day}`;
  return `${day} ${p.monthShort} ${p.year}`;
}

/** "17:30" or "5:30 PM" in the workspace time zone. */
export function formatTime(date: Date | string, prefs: DatePrefs = DEFAULT_DATE_PREFS): string {
  const p = parts(new Date(date), prefs);
  if (prefs.timeFormat === "12h") return `${Number(p.hour)}:${p.minute} ${p.dayPeriod.toUpperCase()}`.trim();
  return `${p.hour}:${p.minute}`;
}

/** "14 Nov 2026, 17:30" (date + time) in the workspace time zone. */
export function formatDateTime(date: Date | string, prefs: DatePrefs = DEFAULT_DATE_PREFS): string {
  return `${formatDate(date, prefs)}, ${formatTime(date, prefs)}`;
}

/** "Asia/Kolkata (GMT+5:30)". */
export function timeZoneLabel(timezone: string, at: Date = new Date()): string {
  const offset =
    new Intl.DateTimeFormat("en-US", { timeZone: timezone, timeZoneName: "shortOffset" })
      .formatToParts(at)
      .find((p) => p.type === "timeZoneName")?.value ?? "";
  return offset && offset !== timezone ? `${timezone} (${offset})` : timezone;
}

/** The calendar day ("2026-11-14") that `date` falls on in `timezone`. For statistics buckets. */
export function dayKey(date: Date, timezone: string): string {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
  return p; // en-CA formats as YYYY-MM-DD
}

/** Minutes the zone is ahead of UTC at `date` (e.g. +330 for Asia/Kolkata). */
function offsetMinutes(date: Date, timezone: string): number {
  const p = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (t: string) => Number(p.find((x) => x.type === t)?.value);
  const hour = get("hour") === 24 ? 0 : get("hour");
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), hour, get("minute"), get("second"));
  return Math.round((asUtc - date.getTime()) / 60_000);
}

/**
 * The UTC instant when the calendar day `key` ("2026-11-14") starts in
 * `timezone`. Use it to turn a date-range picker into database bounds:
 * from = startOfDay(fromKey), to = startOfDay(dayAfter(toKey)).
 */
export function startOfDay(key: string, timezone: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  const guess = new Date(Date.UTC(y, m - 1, d));
  // Two passes handle days on which the offset changes (daylight saving).
  let result = new Date(guess.getTime() - offsetMinutes(guess, timezone) * 60_000);
  result = new Date(guess.getTime() - offsetMinutes(result, timezone) * 60_000);
  return result;
}

/** "2026-11-14" → "2026-11-15". */
export function dayAfter(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}

/** True for a well-formed "YYYY-MM-DD" that is a real date. */
export function isDayKey(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}
