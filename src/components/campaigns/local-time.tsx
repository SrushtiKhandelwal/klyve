"use client";

import { useSyncExternalStore } from "react";
import { useNow } from "@/components/settings/senders/use-now";

// Dates on the campaign screens are shown in the VIEWER's time zone. The
// server doesn't know that time zone, so it first renders UTC; once the page
// runs in the browser it switches to local time. useSyncExternalStore makes
// that switch without a hydration mismatch (same trick as LocalDateTime in
// the contacts import screens).

const noopSubscribe = () => () => {};
const inBrowser = () => true;
const onServer = () => false;

export function useInBrowser(): boolean {
  return useSyncExternalStore(noopSubscribe, inBrowser, onServer);
}

/** "14 Nov 2026, 10:30" in the viewer's time zone (UTC on the server). */
export function formatDateTime(date: Date, local: boolean): string {
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

/** A date and time, e.g. "14 Nov 2026, 10:30", in the viewer's time zone. */
export function LocalDateTime({ iso }: { iso: string }) {
  const local = useInBrowser();
  const date = new Date(iso);
  return (
    <time dateTime={iso} title={local ? date.toString() : undefined}>
      {formatDateTime(date, local)}
    </time>
  );
}

/** "just now", "5 min ago", "3 hours ago", "2 days ago", then the date. */
export function RelativeTime({ iso }: { iso: string }) {
  // null on the server and during hydration, then the current time (ticking).
  const now = useNow();
  const date = new Date(iso);
  // Before the browser takes over, show the plain date (no "ago": the server's clock may differ).
  if (now === null) return <time dateTime={iso}>{formatDateTime(date, false)}</time>;

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
  } else text = date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

  return (
    <time dateTime={iso} title={date.toLocaleString()}>
      {text}
    </time>
  );
}
