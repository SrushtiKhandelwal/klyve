import "server-only";
import { db } from "@/lib/db";
import { findSuppression } from "@/lib/suppression";

// GDPR "right of access": everything this workspace stores about ONE
// contact, as a JSON document the workspace can hand to the person.
//
// What's included: the profile, list memberships, every campaign they were
// sent (with sent / opened / clicked times), every tracked event, their
// consent history, and whether their address is on the suppression list.
//
// What's left out on purpose:
//  - IP hashes: they are a keyed hash used to spot duplicate clicks. They
//    reveal nothing to the person and would only leak our server secret's output.
//  - Internal ids of other rows (we keep only what explains the data).
//
// The export itself is NOT written to the consent record: downloading data
// isn't a consent decision, and logging it there would mix up the proof.

/** Bump if the file's shape changes, so people can tell versions apart. */
const EXPORT_FORMAT_VERSION = 1;
/** Upper limit of tracked events in one file, so a huge history can't exhaust memory. */
const MAX_EVENTS = 10_000;

export type ContactExport = Awaited<ReturnType<typeof buildContactExport>>;

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

/**
 * Builds the export for a contact of this workspace, or null if the contact
 * doesn't exist here. `workspaceId` must come from the logged-in user's
 * active workspace (never from the browser).
 */
export async function buildContactExport(workspaceId: string, contactId: string) {
  if (typeof contactId !== "string" || contactId.length === 0 || contactId.length > 64) return null;

  const contact = await db.contact.findFirst({
    where: { id: contactId, workspaceId },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      status: true,
      attributes: true,
      source: true,
      optInSentAt: true,
      confirmedAt: true,
      createdAt: true,
      updatedAt: true,
      workspace: { select: { name: true } },
      lists: {
        where: { list: { workspaceId } },
        orderBy: { addedAt: "asc" },
        select: { addedAt: true, list: { select: { name: true } } },
      },
    },
  });
  if (!contact) return null;

  // Emails sent to this person. Rows of an earlier contact with the same
  // address (deleted and re-added later) are the same person, so they count too.
  const recipients = await db.campaignRecipient.findMany({
    where: {
      campaign: { workspaceId },
      OR: [{ contactId: contact.id }, { email: contact.email }],
    },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      email: true,
      status: true,
      sentAt: true,
      deliveredAt: true,
      firstOpenedAt: true,
      openCount: true,
      firstClickedAt: true,
      clickCount: true,
      bouncedAt: true,
      bounceType: true,
      complainedAt: true,
      unsubscribedAt: true,
      campaign: { select: { name: true, subject: true } },
    },
  });

  const events = recipients.length
    ? await db.emailEvent.findMany({
        where: { workspaceId, recipientId: { in: recipients.map((r) => r.id) } },
        orderBy: { createdAt: "asc" },
        take: MAX_EVENTS,
        // ipHash is deliberately NOT selected (see the note at the top).
        select: {
          type: true,
          createdAt: true,
          isBot: true,
          userAgent: true,
          detail: true,
          recipientId: true,
          link: { select: { url: true } },
        },
      })
    : [];
  const campaignOf = new Map(recipients.map((r) => [r.id, r.campaign.name]));

  const consent = await db.consentEvent.findMany({
    where: { workspaceId, OR: [{ contactId: contact.id }, { email: contact.email }] },
    orderBy: { createdAt: "asc" },
    select: { type: true, source: true, email: true, userAgent: true, ipHash: true, detail: true, createdAt: true },
  });

  const suppression = await findSuppression(workspaceId, contact.email);

  return {
    format: "klyve.contact-export",
    version: EXPORT_FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    workspace: contact.workspace.name,
    profile: {
      email: contact.email,
      firstName: contact.firstName,
      lastName: contact.lastName,
      status: contact.status,
      source: contact.source,
      attributes: contact.attributes,
      createdAt: iso(contact.createdAt),
      updatedAt: iso(contact.updatedAt),
      confirmationEmailSentAt: iso(contact.optInSentAt),
      confirmedAt: iso(contact.confirmedAt),
    },
    lists: contact.lists.map((m) => ({ name: m.list.name, addedAt: iso(m.addedAt) })),
    campaigns: recipients.map((r) => ({
      campaign: r.campaign.name,
      subject: r.campaign.subject,
      sentTo: r.email,
      status: r.status,
      sentAt: iso(r.sentAt),
      deliveredAt: iso(r.deliveredAt),
      firstOpenedAt: iso(r.firstOpenedAt),
      openCount: r.openCount,
      firstClickedAt: iso(r.firstClickedAt),
      clickCount: r.clickCount,
      bouncedAt: iso(r.bouncedAt),
      bounceType: r.bounceType,
      markedAsSpamAt: iso(r.complainedAt),
      unsubscribedAt: iso(r.unsubscribedAt),
    })),
    events: events.map((e) => ({
      type: e.type,
      at: iso(e.createdAt),
      campaign: campaignOf.get(e.recipientId) ?? null,
      link: e.link?.url ?? null,
      likelyAutomated: e.isBot,
      device: e.userAgent,
      detail: e.detail,
    })),
    eventsTruncated: events.length >= MAX_EVENTS,
    consentHistory: consent.map((c) => ({
      type: c.type,
      source: c.source,
      email: c.email,
      at: iso(c.createdAt),
      // Only whether an IP was recorded; the hash itself stays private (see top).
      ipRecorded: !!c.ipHash,
      device: c.userAgent,
      detail: c.detail,
    })),
    suppression: suppression ? { suppressed: true, reason: suppression.reason } : { suppressed: false, reason: null },
  };
}

/** "Priya.R+news@example.com" → a file name safe in a Content-Disposition header. */
export function exportFileName(email: string, now = new Date()): string {
  const safe = email.toLowerCase().replace(/[^a-z0-9@._-]+/g, "_").slice(0, 100);
  return `contact-${safe}-${now.toISOString().slice(0, 10)}.json`;
}
