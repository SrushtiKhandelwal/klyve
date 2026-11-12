// Labels and badge colours for campaign + recipient statuses, so every screen
// shows them the same way. Safe to import from server AND client.

export const CAMPAIGN_STATUSES = ["DRAFT", "SCHEDULED", "SENDING", "PAUSED", "SENT", "CANCELLED", "FAILED"] as const;
export type CampaignStatusValue = (typeof CAMPAIGN_STATUSES)[number];

export const CAMPAIGN_STATUS_META: Record<CampaignStatusValue, { label: string; className: string }> = {
  DRAFT: { label: "Draft", className: "bg-zinc-100 text-zinc-700 ring-zinc-500/20" },
  SCHEDULED: { label: "Scheduled", className: "bg-sky-50 text-sky-700 ring-sky-600/20" },
  SENDING: { label: "Sending", className: "bg-amber-50 text-amber-700 ring-amber-600/20" },
  PAUSED: { label: "Paused", className: "bg-orange-50 text-orange-700 ring-orange-600/20" },
  SENT: { label: "Sent", className: "bg-emerald-50 text-emerald-700 ring-emerald-600/20" },
  CANCELLED: { label: "Cancelled", className: "bg-zinc-100 text-zinc-500 ring-zinc-500/20" },
  FAILED: { label: "Failed", className: "bg-red-50 text-red-700 ring-red-600/20" },
};

export const RECIPIENT_STATUSES = ["PENDING", "SENDING", "SENT", "FAILED", "SKIPPED"] as const;
export type RecipientStatusValue = (typeof RECIPIENT_STATUSES)[number];

export const RECIPIENT_STATUS_META: Record<RecipientStatusValue, { label: string; className: string }> = {
  PENDING: { label: "Queued", className: "bg-zinc-100 text-zinc-600 ring-zinc-500/20" },
  SENDING: { label: "Sending", className: "bg-amber-50 text-amber-700 ring-amber-600/20" },
  SENT: { label: "Sent", className: "bg-emerald-50 text-emerald-700 ring-emerald-600/20" },
  FAILED: { label: "Failed", className: "bg-red-50 text-red-700 ring-red-600/20" },
  SKIPPED: { label: "Skipped", className: "bg-zinc-100 text-zinc-500 ring-zinc-500/20" },
};

/** Campaigns in these states can still be edited. */
export const EDITABLE_STATUSES: CampaignStatusValue[] = ["DRAFT"];
/** Campaigns in these states are "live" (the worker may touch them). */
export const ACTIVE_STATUSES: CampaignStatusValue[] = ["SCHEDULED", "SENDING"];
