// Turns consent rows (from listConsentEvents) into small, plain objects the
// contact page can show. No server code here: the page and the "Load more"
// Server Action both use it, and the result is sent to the browser.
//
// The IP hash is never sent to the browser, only whether one was recorded.

import { CONSENT_EVENT_LABELS, consentSourceLabel } from "@/lib/consent/labels";
import type { ConsentEventRow } from "@/lib/consent";

export type ConsentEventView = {
  id: string;
  type: ConsentEventRow["type"];
  label: string;
  source: string;
  /** ISO date-time (for the <time> tag). */
  at: string;
  /** Formatted on the server, so server and browser render the same text. */
  when: string;
  /** One short line, e.g. "2 lists · Double opt-in: no · by Priya". Empty when nothing to add. */
  detail: string;
};

const dateTimeFormat = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export type ConsentPageView = { rows: ConsentEventView[]; nextCursor: string | null };

/** "doubleOptIn" → "Double opt in". */
function humanize(key: string): string {
  const words = key.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ").toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function shorten(text: string, max = 40): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/** A few readable facts from the event's detail JSON; internal ids are skipped. */
export function describeConsentDetail(row: Pick<ConsentEventRow, "detail" | "createdBy" | "hasIp">): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(row.detail ?? {})) {
    if (parts.length >= 3) break;
    if (/ids?$/i.test(key) && key !== "lists") continue; // e.g. importId: means nothing to a person
    if (key === "lists" && Array.isArray(value)) {
      parts.push(`${value.length} list${value.length === 1 ? "" : "s"}`);
    } else if (typeof value === "boolean") {
      parts.push(`${humanize(key)}: ${value ? "yes" : "no"}`);
    } else if (typeof value === "string" || typeof value === "number") {
      parts.push(`${humanize(key)}: ${shorten(String(value))}`);
    }
  }
  if (row.createdBy) parts.push(`by ${shorten(row.createdBy.name || row.createdBy.email, 30)}`);
  if (row.hasIp) parts.push("IP recorded");
  return parts.join(" · ");
}

export function toConsentView(row: ConsentEventRow): ConsentEventView {
  return {
    id: row.id,
    type: row.type,
    label: CONSENT_EVENT_LABELS[row.type] ?? row.type,
    source: consentSourceLabel(row.source),
    at: row.createdAt.toISOString(),
    when: dateTimeFormat.format(row.createdAt),
    detail: describeConsentDetail(row),
  };
}

export function toConsentPageView(page: { rows: ConsentEventRow[]; nextCursor: string | null }): ConsentPageView {
  return { rows: page.rows.map(toConsentView), nextCursor: page.nextCursor };
}
