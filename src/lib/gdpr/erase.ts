import "server-only";
import { randomBytes } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { addSuppressions, suppressionKeyForErasure } from "@/lib/suppression";

// GDPR "right to erasure" ("forget me") for ONE contact.
//
// WHAT IS REMOVED
//  - The contact itself: name, address, custom fields, status, and its list
//    memberships (they are deleted with it, onDelete: Cascade).
//  - Their address on every campaign email sent to them: the row becomes
//    "erased-<random>@erased.invalid" and is no longer linked to a contact.
//  - Device (user agent), IP hash and provider details (e.g. a bounce
//    message that quotes the address) on their tracked events.
//  - Their address, IP hash and device in the consent record (replaced by a
//    one-way hash of the address).
//  - Any plain-text entry for their address on the suppression list.
//  - Every transactional email (Phase 9: receipts, password resets...) this
//    workspace sent to their address, including emails sent before they
//    were a contact (rows without a contactId). Those rows are DELETED, not
//    anonymised: they are a log, not part of any report.
//
// WHAT IS KEPT (no personal data left in it)
//  - The anonymous campaign rows and events, so campaign reports and
//    counters (sent, opened, bounced...) stay correct.
//  - The consent rows (now hashed): the law asks us to keep proof of what
//    happened, and a hash can't be turned back into an address.
//  - One new ERASED consent event, recording that the erasure happened.
//  - If `keepSuppressed` (the default): a hashed ERASURE entry on the
//    suppression list. Without it, the same address could be imported again
//    by mistake and emailed, and we could no longer tell it was erased.
//
// The random part of "erased-<random>@erased.invalid" is NOT derived from the
// address, so nobody can find a person's old rows by hashing their address.
// (".invalid" is a reserved domain: mail to it can never be delivered.)

/** Prisma client or a transaction. */
type Client = Prisma.TransactionClient;

export type EraseOptions = {
  /** The team member doing it (stored on the ERASED consent event and the suppression row). */
  userId: string | null;
  /** Keep a hashed "never email again" entry. Defaults to true. */
  keepSuppressed?: boolean;
};

export type EraseResult =
  | {
      ok: true;
      campaignEmailsAnonymized: number;
      eventsCleaned: number;
      consentEventsHashed: number;
      transactionalEmailsDeleted: number;
      suppressed: boolean;
    }
  | { ok: false; error: string };

/** Event detail keys that never hold personal data; everything else is dropped. */
const SAFE_DETAIL_KEYS = ["bounceType", "botReason"] as const;

/**
 * Erases a contact of this workspace. `workspaceId` must come from the
 * logged-in user's active workspace; the caller checks the user's role.
 * Everything happens in ONE transaction: either all of it, or none of it.
 */
export async function eraseContact(workspaceId: string, contactId: string, opts: EraseOptions): Promise<EraseResult> {
  if (typeof contactId !== "string" || contactId.length === 0 || contactId.length > 64) {
    return { ok: false, error: "Contact not found." };
  }
  const keepSuppressed = opts.keepSuppressed ?? true;

  return db.$transaction(
    async (tx) => {
      const contact = await tx.contact.findFirst({ where: { id: contactId, workspaceId }, select: { id: true, email: true } });
      if (!contact) return { ok: false as const, error: "Contact not found." };

      const email = contact.email;
      const hashed = suppressionKeyForErasure(email);
      const anonymous = `erased-${randomBytes(6).toString("hex")}@erased.invalid`;

      const recipientIds = await anonymizeRecipients(tx, workspaceId, contact.id, email, anonymous);
      const eventsCleaned = await cleanEvents(tx, workspaceId, recipientIds);

      // Consent proof stays, but only with the hash of the address.
      const consent = await tx.consentEvent.updateMany({
        where: { workspaceId, OR: [{ contactId: contact.id }, { email }] },
        data: { email: hashed, ipHash: null, userAgent: null },
      });

      // Transactional emails to this address (stored lower-cased, like contact emails).
      const transactional = await tx.transactionalEmail.deleteMany({
        where: { workspaceId, OR: [{ contactId: contact.id }, { toEmail: email }] },
      });

      // Memberships go with it (cascade); recipient/consent links were cleared above.
      await tx.contact.delete({ where: { id: contact.id } });

      // Written here (not with recordConsent) so it's part of the same transaction.
      await tx.consentEvent.create({
        data: {
          workspaceId,
          email: hashed,
          type: "ERASED",
          source: "erasure",
          createdById: opts.userId,
          detail: { keptOnSuppressionList: keepSuppressed },
        },
      });

      if (keepSuppressed) {
        // Stores only the hash, and deletes any plain row for this address.
        await addSuppressions(workspaceId, [{ email, reason: "ERASURE" }], { userId: opts.userId, client: tx });
      } else {
        // Erasure means we don't keep the plain address anywhere, not even here.
        await tx.suppression.deleteMany({ where: { workspaceId, email } });
      }

      return {
        ok: true as const,
        campaignEmailsAnonymized: recipientIds.length,
        eventsCleaned,
        consentEventsHashed: consent.count,
        transactionalEmailsDeleted: transactional.count,
        suppressed: keepSuppressed,
      };
    },
    // Big histories can take a moment; the default 5 s would be too tight.
    { timeout: 60_000, maxWait: 10_000 },
  );
}

/**
 * Replaces the address on every campaign email this person was sent (also
 * rows left over from an earlier contact with the same address), and unlinks
 * them from the contact. Returns the row ids.
 */
async function anonymizeRecipients(
  tx: Client,
  workspaceId: string,
  contactId: string,
  email: string,
  anonymous: string,
): Promise<string[]> {
  const rows = await tx.campaignRecipient.findMany({
    where: { campaign: { workspaceId }, OR: [{ contactId }, { email }] },
    select: { id: true, lastError: true },
  });
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);

  await tx.campaignRecipient.updateMany({ where: { id: { in: ids } }, data: { email: anonymous, contactId: null } });

  // A failure message can quote the address ("550 <priya@x.com> unknown").
  const pattern = email.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); // the address, matched literally
  for (const r of rows) {
    if (r.lastError && new RegExp(pattern, "i").test(r.lastError)) {
      const cleaned = r.lastError.replace(new RegExp(pattern, "gi"), anonymous);
      await tx.campaignRecipient.update({ where: { id: r.id }, data: { lastError: cleaned } });
    }
  }
  return ids;
}

/**
 * Removes device, IP hash and free-text provider details from the events of
 * these rows. Only `bounceType` / `botReason` survive: reports and duplicate
 * detection need them, and they say nothing about the person.
 */
async function cleanEvents(tx: Client, workspaceId: string, recipientIds: string[]): Promise<number> {
  if (recipientIds.length === 0) return 0;
  const keep = Prisma.join(SAFE_DETAIL_KEYS.map((k) => Prisma.sql`${k}::text, detail -> ${k}::text`));
  return tx.$executeRaw(Prisma.sql`
    UPDATE email_event
    SET "userAgent" = NULL, "ipHash" = NULL,
        detail = CASE WHEN detail IS NULL THEN NULL
                      ELSE NULLIF(jsonb_strip_nulls(jsonb_build_object(${keep})), '{}'::jsonb) END
    WHERE "workspaceId" = ${workspaceId} AND "recipientId" = ANY(${recipientIds}::text[])`);
}
