// Shapes the campaign pages hand to their client components. The server pages
// build these from the database results (dates as ISO strings, because only
// plain JSON can cross from server to browser).
import type { CampaignStatusValue } from "@/lib/campaigns/status";

/** One row on /campaigns. */
export type CampaignRowView = {
  id: string;
  name: string;
  status: CampaignStatusValue;
  subject: string;
  senderLabel: string | null;
  recipientCount: number;
  sentCount: number;
  failedCount: number;
  scheduledAt: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  updatedAt: string;
};

/** Campaigns in these states can be deleted (never while the queue may still use them). */
export const DELETABLE_STATUSES: CampaignStatusValue[] = ["DRAFT", "SENT", "CANCELLED", "FAILED"];

/** "1,240" — numbers always formatted the same way. */
export function formatCount(n: number): string {
  return n.toLocaleString("en");
}

/** "1 person" / "1,240 people". */
export function people(n: number): string {
  return `${formatCount(n)} ${n === 1 ? "person" : "people"}`;
}
