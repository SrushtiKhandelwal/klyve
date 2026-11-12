// The live progress numbers, as plain JSON (dates as ISO strings). Built on
// the server for the first render and in the browser from each poll.
import type { CampaignStatusValue, RecipientStatusValue } from "@/lib/campaigns/status";

export type ProgressView = {
  status: CampaignStatusValue;
  counts: Record<RecipientStatusValue, number>;
  total: number;
  startedAt: string | null;
  finishedAt: string | null;
  lastError: string | null;
};

type DateLike = Date | string | null;
const iso = (d: DateLike) => (d === null ? null : typeof d === "string" ? d : d.toISOString());

export function toProgressView(p: {
  status: string;
  counts: Record<string, number>;
  total: number;
  startedAt: DateLike;
  finishedAt: DateLike;
  lastError: string | null;
}): ProgressView {
  return {
    status: p.status as CampaignStatusValue,
    counts: {
      PENDING: p.counts.PENDING ?? 0,
      SENDING: p.counts.SENDING ?? 0,
      SENT: p.counts.SENT ?? 0,
      FAILED: p.counts.FAILED ?? 0,
      SKIPPED: p.counts.SKIPPED ?? 0,
    },
    total: p.total,
    startedAt: iso(p.startedAt),
    finishedAt: iso(p.finishedAt),
    lastError: p.lastError,
  };
}

/** While a campaign is in one of these states, the page keeps polling for news. */
export const LIVE_STATUSES: CampaignStatusValue[] = ["SCHEDULED", "SENDING", "PAUSED"];
