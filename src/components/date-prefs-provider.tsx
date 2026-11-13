"use client";

import { createContext, use, type ReactNode } from "react";
import type { DatePrefs } from "@/lib/format-date";

// Shares the workspace's date settings (time zone, date format, 12/24-hour
// clock from Settings → General) with every date on the dashboard.
//
// HOW IT WORKS: the dashboard layout must not wait for anything (so the page
// frame shows instantly), so it hands us a PROMISE of the settings instead of
// the settings themselves. A date component calls useDatePrefs(), which waits
// for that promise. The dates sit inside the pages' own <Suspense> sections
// (they show data, which needs the logged-in user anyway), so nothing else
// waits. Once loaded, later page changes reuse the answer instantly.
//
// Outside the dashboard (public pages) there is no provider and
// useDatePrefs() returns null: the date components then keep their old
// behaviour (the viewer's own time zone).

const DatePrefsContext = createContext<Promise<DatePrefs | null> | null>(null);

export function DatePrefsProvider({ prefs, children }: { prefs: Promise<DatePrefs | null>; children: ReactNode }) {
  return <DatePrefsContext value={prefs}>{children}</DatePrefsContext>;
}

/** The workspace's date settings, or null outside the dashboard (or when unknown). */
export function useDatePrefs(): DatePrefs | null {
  const prefs = use(DatePrefsContext);
  return prefs ? use(prefs) : null;
}
