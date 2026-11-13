// Small helpers shared by the statistics bar charts (no library: plain HTML
// bars sized with percentages, so they need no JavaScript and fit any width).

/** A round top value for the y axis: 7 → 8, 37 → 40, 0 → 4. */
export function niceTop(max: number): number {
  if (max <= 4) return 4;
  const magnitude = 10 ** Math.floor(Math.log10(max));
  for (const step of [1, 2, 2.5, 5, 10]) {
    if (step * magnitude >= max) return step * magnitude;
  }
  return 10 * magnitude;
}

/**
 * "2026-11-13" → "13 Nov" (or "Fri 13 Nov"). The key already IS a calendar
 * day (in the workspace time zone), so it is formatted as-is, in UTC.
 */
export function dayLabel(day: string, options: { weekday?: boolean; year?: boolean } = {}): string {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString("en-GB", {
    ...(options.weekday ? { weekday: "short" } : {}),
    day: "numeric",
    month: "short",
    ...(options.year ? { year: "numeric" } : {}),
    timeZone: "UTC",
  });
}

/** Show every Nth day under the bars, so labels never overlap (about 8–10 labels). */
export function labelStep(count: number): number {
  if (count <= 10) return 1;
  if (count <= 31) return Math.ceil(count / 8);
  return Math.ceil(count / 10);
}

export const fmt = (n: number) => n.toLocaleString("en");
