"use client";

import { useSyncExternalStore } from "react";

// A clock for countdowns ("Resend in 42s") and "checked 3 minutes ago".
// It returns null while rendering on the server (and during hydration), so the
// server HTML and the first browser render always match; then it ticks every second.

function subscribe(onTick: () => void) {
  const timer = setInterval(onTick, 1000);
  return () => clearInterval(timer);
}

// Rounded to whole seconds so React sees the same value within one second.
const nowInSeconds = () => Math.floor(Date.now() / 1000);
const onServer = () => null;

/** Current time in milliseconds (whole seconds), or null before hydration. */
export function useNow(): number | null {
  const seconds = useSyncExternalStore(subscribe, nowInSeconds, onServer);
  return seconds === null ? null : seconds * 1000;
}

/** Seconds left until `startedAt + seconds`, or 0 when it's over / unknown. */
export function useCountdown(startedAt: string | number | null | undefined, seconds: number): number {
  const now = useNow();
  if (!startedAt || now === null) return 0;
  const start = typeof startedAt === "number" ? startedAt : new Date(startedAt).getTime();
  return Math.max(0, Math.ceil((start + seconds * 1000 - now) / 1000));
}
