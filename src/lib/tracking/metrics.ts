// Shared labels + maths for engagement reports, so every screen computes
// "open rate" etc. the SAME way. Safe to import from server AND client.

export const EVENT_TYPES = ["DELIVERED", "OPENED", "CLICKED", "BOUNCED", "COMPLAINED", "UNSUBSCRIBED"] as const;
export type EventTypeValue = (typeof EVENT_TYPES)[number];

export const EVENT_TYPE_META: Record<EventTypeValue, { label: string; pastTense: string; className: string }> = {
  DELIVERED: { label: "Delivered", pastTense: "was delivered", className: "bg-sky-50 text-sky-700 ring-sky-600/20" },
  OPENED: { label: "Opened", pastTense: "opened", className: "bg-emerald-50 text-emerald-700 ring-emerald-600/20" },
  CLICKED: { label: "Clicked", pastTense: "clicked a link", className: "bg-violet-50 text-violet-700 ring-violet-600/20" },
  BOUNCED: { label: "Bounced", pastTense: "bounced", className: "bg-amber-50 text-amber-700 ring-amber-600/20" },
  COMPLAINED: { label: "Marked as spam", pastTense: "marked it as spam", className: "bg-red-50 text-red-700 ring-red-600/20" },
  UNSUBSCRIBED: { label: "Unsubscribed", pastTense: "unsubscribed", className: "bg-zinc-100 text-zinc-600 ring-zinc-500/20" },
};

export type CampaignStats = {
  sentCount: number;
  openCount: number; // unique people
  clickCount: number; // unique people
  bounceCount: number;
  complaintCount: number;
  unsubscribeCount: number;
};

/** 0.1234 → "12.3%". Empty denominator → "—". */
export function formatRate(part: number, whole: number): string {
  if (!whole) return "—";
  const pct = (part / whole) * 100;
  return `${pct >= 10 || pct === 0 ? pct.toFixed(0) : pct.toFixed(1)}%`;
}

/**
 * Industry-standard definitions (same as Brevo/Mailchimp):
 *  - open rate   = unique opens   / emails sent (minus bounces)
 *  - click rate  = unique clicks  / emails sent (minus bounces)
 *  - click-to-open = unique clicks / unique opens
 *  - bounce, complaint, unsubscribe rates = count / emails sent
 */
export function campaignRates(s: CampaignStats) {
  const delivered = Math.max(0, s.sentCount - s.bounceCount);
  return {
    delivered,
    openRate: formatRate(s.openCount, delivered),
    clickRate: formatRate(s.clickCount, delivered),
    clickToOpen: formatRate(s.clickCount, s.openCount),
    bounceRate: formatRate(s.bounceCount, s.sentCount),
    complaintRate: formatRate(s.complaintCount, s.sentCount),
    unsubscribeRate: formatRate(s.unsubscribeCount, s.sentCount),
  };
}

/** Gmail/Yahoo want spam complaints under 0.3% (ideally under 0.1%). */
export const COMPLAINT_RATE_LIMIT = 0.003;
/** Above ~2% hard bounces, providers start to distrust a sender. */
export const BOUNCE_RATE_WARNING = 0.02;

/** Note shown next to open stats: opens are an estimate, not a fact. */
export const OPENS_DISCLAIMER =
  "Opens are an estimate: some email apps (like Apple Mail) load images automatically, and some people block images. Clicks are more reliable.";
