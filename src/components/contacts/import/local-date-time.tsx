"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/**
 * Shows a date in the VIEWER's time zone. The server doesn't know that time
 * zone, so it first renders UTC; once the page is running in the browser it
 * switches to local time (without a hydration mismatch).
 */
export function LocalDateTime({ iso }: { iso: string }) {
  const inBrowser = useSyncExternalStore(subscribe, () => true, () => false);
  const date = new Date(iso);
  const text = inBrowser
    ? date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
    : `${date.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" })} UTC`;
  return <time dateTime={iso}>{text}</time>;
}
