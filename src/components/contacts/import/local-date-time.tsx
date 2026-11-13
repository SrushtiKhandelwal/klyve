"use client";

import { useSyncExternalStore } from "react";
import { useDatePrefs } from "@/components/date-prefs-provider";
import { formatDateTime, timeZoneLabel } from "@/lib/format-date";

const subscribe = () => () => {};

/**
 * Shows a date and time. Inside the dashboard it follows the workspace's
 * settings (Settings → General: time zone, date and time format).
 *
 * Without those settings it uses the VIEWER's time zone. The server doesn't
 * know that time zone, so it first renders UTC; once the page is running in
 * the browser it switches to local time (without a hydration mismatch).
 */
export function LocalDateTime({ iso }: { iso: string }) {
  const prefs = useDatePrefs();
  const inBrowser = useSyncExternalStore(subscribe, () => true, () => false);
  const date = new Date(iso);
  if (prefs) {
    return (
      <time dateTime={iso} title={timeZoneLabel(prefs.timezone, date)}>
        {formatDateTime(date, prefs)}
      </time>
    );
  }
  const text = inBrowser
    ? date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
    : `${date.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" })} UTC`;
  return <time dateTime={iso}>{text}</time>;
}
