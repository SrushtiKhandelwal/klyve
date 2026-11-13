// Sending-health thresholds and the "traffic light" for each rate.
// No server code here, so the Deliverability page's components can use it.
//
// Where the numbers come from:
//  - Spam complaints: Gmail and Yahoo's bulk-sender rules (2024) say stay
//    under 0.3%, ideally under 0.1%. COMPLAINT_RATE_LIMIT in metrics.ts.
//  - Hard bounces: mailbox providers start to distrust a sender above ~2%
//    (BOUNCE_RATE_WARNING in metrics.ts); 5% and more is what an old or
//    bought list looks like, and what gets accounts at Amazon SES, SendGrid
//    & co. reviewed or suspended.
//  - Unsubscribes aren't policed by providers, but more than ~0.5% per email
//    usually means people didn't expect it; 1%+ is a strong signal.

import { BOUNCE_RATE_WARNING, COMPLAINT_RATE_LIMIT } from "@/lib/tracking/metrics";

export type HealthStatus = "good" | "warning" | "critical" | "none";

export const COMPLAINT_RATE_GOOD = 0.001; // under 0.1% → good
export { COMPLAINT_RATE_LIMIT }; // 0.3% and more → critical
export { BOUNCE_RATE_WARNING }; // under 2% → good
export const BOUNCE_RATE_CRITICAL = 0.05; // 5% and more → critical
export const UNSUBSCRIBE_RATE_WARNING = 0.005;
export const UNSUBSCRIBE_RATE_CRITICAL = 0.01;

/** Below this many emails, rates jump around a lot, so the page says so. */
export const LOW_VOLUME = 200;

function grade(rate: number, warningAt: number, criticalAt: number, sent: number): HealthStatus {
  if (sent === 0) return "none";
  if (rate >= criticalAt) return "critical";
  if (rate >= warningAt) return "warning";
  return "good";
}

export const complaintStatus = (rate: number, sent: number) => grade(rate, COMPLAINT_RATE_GOOD, COMPLAINT_RATE_LIMIT, sent);
export const bounceStatus = (rate: number, sent: number) => grade(rate, BOUNCE_RATE_WARNING, BOUNCE_RATE_CRITICAL, sent);
export const unsubscribeStatus = (rate: number, sent: number) =>
  grade(rate, UNSUBSCRIBE_RATE_WARNING, UNSUBSCRIBE_RATE_CRITICAL, sent);

/** The worse of several statuses (critical > warning > good > none). */
export function worstStatus(...statuses: HealthStatus[]): HealthStatus {
  const order: HealthStatus[] = ["none", "good", "warning", "critical"];
  return statuses.reduce<HealthStatus>((worst, s) => (order.indexOf(s) > order.indexOf(worst) ? s : worst), "none");
}

/** 0.062 → "6.2%", 0.0035 → "0.35%", 0 → "0%". Small rates get more decimals. */
export function formatPercent(rate: number): string {
  if (!Number.isFinite(rate) || rate <= 0) return "0%";
  const pct = rate * 100;
  const text = pct >= 1 ? pct.toFixed(1) : pct >= 0.1 ? pct.toFixed(2) : pct.toFixed(3);
  return `${text.replace(/\.?0+$/, "")}%`;
}

// ── Messages the automatic pause leaves in campaign.lastError ──────────────
// They start with fixed words, so the code can recognise its own messages
// (and read back the number of emails sent at the time of the pause).

export const AUTO_PAUSE_PREFIX = "Paused automatically after ";
export const RESUMED_NOTE_PREFIX = "Resumed after an automatic pause at ";

/** True for a campaign message written by the automatic sending-health check. */
export function isHealthMessage(lastError: string | null | undefined): boolean {
  return !!lastError && (lastError.startsWith(AUTO_PAUSE_PREFIX) || lastError.startsWith(RESUMED_NOTE_PREFIX));
}
