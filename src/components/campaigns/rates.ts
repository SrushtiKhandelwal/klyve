// Open/click rates for one campaign row (campaigns list, dashboard). Safe to
// import from server AND client. The maths itself lives in metrics.ts, so the
// numbers match the campaign report exactly.
import { campaignRates } from "@/lib/tracking/metrics";

export type RateInput = {
  status: string;
  trackOpens: boolean;
  trackClicks: boolean;
  sentCount: number;
  openCount: number;
  clickCount: number;
  bounceCount: number;
  complaintCount: number;
  unsubscribeCount: number;
};

/** Nothing has gone out yet in these states, so there's no rate to show. */
const NOT_SENT = ["DRAFT", "SCHEDULED"];

/**
 * { open: "38%", click: "12%" }, or "—" when there's nothing honest to show:
 * a draft/scheduled campaign, nothing sent yet, or that kind of tracking was off
 * (a "0%" there would look like nobody opened, which isn't what happened).
 */
export function rowRates(row: RateInput): { open: string; click: string; openTitle?: string; clickTitle?: string } {
  if (NOT_SENT.includes(row.status) || row.sentCount === 0) return { open: "—", click: "—" };
  const rates = campaignRates(row);
  return {
    open: row.trackOpens ? rates.openRate : "—",
    click: row.trackClicks ? rates.clickRate : "—",
    openTitle: row.trackOpens ? undefined : "Open tracking was off for this campaign",
    clickTitle: row.trackClicks ? undefined : "Click tracking was off for this campaign",
  };
}
