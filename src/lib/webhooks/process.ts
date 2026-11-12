import "server-only";
import { db } from "@/lib/db";
import { recordEvent } from "@/lib/tracking/record";
import type { WebhookEvent } from "./types";

// Matches webhook events to the emails we sent, then records them.
//
// THE CROSS-WORKSPACE GUARD: a webhook URL belongs to ONE provider of ONE
// workspace. Every lookup below therefore also requires
//   campaign.providerId  = this provider   AND
//   campaign.workspaceId = this provider's workspace.
// An event naming someone else's recipient (a guessed or copied id) simply
// isn't found, and is counted as "ignored". It can never touch their data.

export type ProcessResult = {
  /** Events we understood in the request. */
  received: number;
  /** New events saved (and contact status updated where needed). */
  recorded: number;
  /** Events we had already saved (the provider sent them again). */
  duplicates: number;
  /** Events for emails we can't find in this provider's campaigns. */
  ignored: number;
};

type Owner = { id: string; workspaceId: string };
type Match = { id: string; campaignId: string };

export async function processWebhookEvents(provider: Owner, events: WebhookEvent[]): Promise<ProcessResult> {
  const result: ProcessResult = { received: events.length, recorded: 0, duplicates: 0, ignored: 0 };
  if (events.length === 0) return result;

  const sameProvider = { providerId: provider.id, workspaceId: provider.workspaceId };

  // Two queries for the whole batch instead of one per event.
  const recipientIds = [...new Set(events.map((e) => e.recipientId).filter((v): v is string => !!v))];
  const byId = new Map<string, Match>();
  if (recipientIds.length) {
    const rows = await db.campaignRecipient.findMany({
      where: { id: { in: recipientIds }, campaign: sameProvider },
      select: { id: true, campaignId: true },
    });
    for (const r of rows) byId.set(r.id, r);
  }

  // Fallback: the provider's message id (for events that came back without our tags).
  const unresolvedMessageIds = [
    ...new Set(
      events.filter((e) => !(e.recipientId && byId.has(e.recipientId)) && e.messageId).map((e) => e.messageId as string),
    ),
  ];
  const byMessageId = new Map<string, Match>();
  if (unresolvedMessageIds.length) {
    const rows = await db.campaignRecipient.findMany({
      where: { providerMessageId: { in: unresolvedMessageIds }, campaign: sameProvider },
      select: { id: true, campaignId: true, providerMessageId: true },
    });
    for (const r of rows) if (r.providerMessageId && !byMessageId.has(r.providerMessageId)) byMessageId.set(r.providerMessageId, r);
  }

  // One at a time, in the order the provider sent them (e.g. delivered, then complained).
  for (const e of events) {
    let match = e.recipientId ? byId.get(e.recipientId) : undefined;
    // Our campaign tag must agree with the recipient's real campaign.
    if (match && e.campaignId && e.campaignId !== match.campaignId) match = undefined;
    if (!match && e.messageId) match = byMessageId.get(e.messageId);
    if (!match) {
      result.ignored++;
      continue;
    }

    const detail: Record<string, string> = {};
    if (e.bounceType) detail.bounceType = e.bounceType;
    if (e.diagnostic) detail.diagnostic = e.diagnostic;
    if (e.providerEventId) detail.providerEventId = e.providerEventId;

    const { recorded } = await recordEvent({
      recipientId: match.id,
      type: e.type,
      detail,
      at: e.at,
    });
    if (recorded) result.recorded++;
    else result.duplicates++;
  }
  return result;
}
