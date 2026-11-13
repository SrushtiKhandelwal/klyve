"use client";

import { useSyncExternalStore } from "react";
import { useDatePrefs } from "@/components/date-prefs-provider";
import { useNow } from "@/components/settings/senders/use-now";
import {
  formatDate as formatWorkspaceDate,
  formatDateTime as formatWorkspaceDateTime,
  timeZoneLabel,
  type DatePrefs,
} from "@/lib/format-date";

// Shared date components, used on many dashboard screens.
//
// Inside the dashboard, dates follow the WORKSPACE's settings (Settings →
// General: time zone, date format, 12/24-hour clock), via useDatePrefs().
// The server and the browser then print exactly the same text.
//
// Outside the dashboard (no settings available) they fall back to the
// VIEWER's time zone: the server doesn't know it, so it first renders UTC;
// once the page runs in the browser it switches to local time.
// useSyncExternalStore makes that switch without a hydration mismatch (same
// trick as LocalDateTime in the contacts import screens).

const noopSubscribe = () => () => {};
const inBrowser = () => true;
const onServer = () => false;

export function useInBrowser(): boolean {
  return useSyncExternalStore(noopSubscribe, inBrowser, onServer);
}

/**
 * "14 Nov 2026, 10:30".
 * - With `prefs` (the workspace's settings): in the workspace's time zone and formats.
 * - Without: in the viewer's time zone when `local` is true, otherwise UTC.
 */
export function formatDateTime(date: Date, local: boolean, prefs?: DatePrefs | null): string {
  if (prefs) return formatWorkspaceDateTime(date, prefs);
  const options: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" };
  return local ? date.toLocaleString(undefined, options) : `${date.toLocaleString("en-GB", { ...options, timeZone: "UTC" })} UTC`;
}

/** "Asia/Kolkata (GMT+5:30)": the viewer's time zone, spelled out. */
export function localTimeZoneLabel(): string {
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const offset =
    new Intl.DateTimeFormat("en-US", { timeZoneName: "shortOffset" })
      .formatToParts(new Date())
      .find((p) => p.type === "timeZoneName")?.value ?? "";
  return offset && offset !== zone ? `${zone} (${offset})` : zone;
}

/** A date and time, e.g. "14 Nov 2026, 10:30", in the workspace's (or viewer's) time zone. */
export function LocalDateTime({ iso }: { iso: string }) {
  const prefs = useDatePrefs();
  const local = useInBrowser();
  const date = new Date(iso);
  if (prefs) {
    return (
      <time dateTime={iso} title={timeZoneLabel(prefs.timezone, date)}>
        {formatWorkspaceDateTime(date, prefs)}
      </time>
    );
  }
  return (
    <time dateTime={iso} title={local ? date.toString() : undefined}>
      {formatDateTime(date, local)}
    </time>
  );
}

/** "just now", "5 min ago", "3 hours ago", "2 days ago", then the date. */
export function RelativeTime({ iso }: { iso: string }) {
  const prefs = useDatePrefs();
  // null on the server and during hydration, then the current time (ticking).
  const now = useNow();
  const date = new Date(iso);
  // Hover text: the exact moment.
  const exact = prefs ? `${formatWorkspaceDateTime(date, prefs)} (${timeZoneLabel(prefs.timezone, date)})` : undefined;
  // Before the browser takes over, show the plain date (no "ago": the server's clock may differ).
  if (now === null) {
    return (
      <time dateTime={iso} title={exact}>
        {formatDateTime(date, false, prefs)}
      </time>
    );
  }

  const minutes = Math.round((now - date.getTime()) / 60_000);
  let text: string;
  if (minutes < 1) text = "just now";
  else if (minutes < 60) text = `${minutes} min ago`;
  else if (minutes < 60 * 24) {
    const hours = Math.round(minutes / 60);
    text = `${hours} hour${hours === 1 ? "" : "s"} ago`;
  } else if (minutes < 60 * 24 * 7) {
    const days = Math.round(minutes / (60 * 24));
    text = `${days} day${days === 1 ? "" : "s"} ago`;
  } else if (prefs) text = formatWorkspaceDate(date, prefs);
  else text = date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

  return (
    <time dateTime={iso} title={exact ?? date.toLocaleString()}>
      {text}
    </time>
  );
}
