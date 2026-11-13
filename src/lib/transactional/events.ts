import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { trimMessage } from "@/lib/email/providers/shared";
import { addSuppressions } from "@/lib/suppression";
import type { WebhookEvent } from "@/lib/webhooks/types";

// What a provider webhook (bounce / complaint) does to a TRANSACTIONAL email.
// Called by src/lib/webhooks/process.ts once it matched the event to one of
// this provider's transactional emails by the provider's message id.
//
// Same rules as campaign emails (src/lib/tracking/record.ts):
//   hard bounce → email BOUNCED, address added to the suppression list
//                 (HARD_BOUNCE), contact (if any) → BOUNCED
//   complaint   → email COMPLAINED, address suppressed (COMPLAINT),
//                 contact (if any) → COMPLAINED
//   soft bounce → ignored (mailbox full, server busy: the next email may arrive)
//   delivered   → ignored: no tracking for transactional email in v1
//
// Safety: the row is read with the provider AND its workspace in the WHERE,
// and locked (FOR UPDATE), so a repeated webhook is handled once and an event
// can never touch another workspace's data.

export type TransactionalEventOutcome = "recorded" | "duplicates" | "ignored";

type Locked = { id: string; workspaceId: string; toEmail: string; contactId: string | null; status: string; subject: string };

export async function recordTransactionalEvent(
  provider: { id: string; workspaceId: string },
  emailId: string,
  e: WebhookEvent,
): Promise<TransactionalEventOutcome> {
  const hardBounce = e.type === "BOUNCED" && e.bounceType === "hard";
  if (!hardBounce && e.type !== "COMPLAINED") return "ignored";

  return db.$transaction(async (tx): Promise<TransactionalEventOutcome> => {
    const rows = await tx.$queryRaw<Locked[]>(Prisma.sql`
      SELECT id, "workspaceId", "toEmail", "contactId", status::text AS status, subject
      FROM transactional_email
      WHERE id = ${emailId} AND "providerId" = ${provider.id} AND "workspaceId" = ${provider.workspaceId}
      FOR UPDATE`);
    const row = rows[0];
    if (!row) return "ignored";

    const diagnostic = e.diagnostic ? ` (${trimMessage(e.diagnostic, 200)})` : "";
    const subject = `“${trimMessage(row.subject, 80)}”`;
    let changed: number;
    if (hardBounce) {
      // Only a SENT email can bounce; BOUNCED/COMPLAINED already = a repeat.
      changed = await tx.$executeRaw(Prisma.sql`
        UPDATE transactional_email
        SET status = 'BOUNCED', "updatedAt" = now() AT TIME ZONE 'UTC',
            "lastError" = ${`Bounced: the receiving server says this address doesn't exist or refuses email${diagnostic}. It was added to your suppression list.`}
        WHERE id = ${row.id} AND status = 'SENT'`);
      await setContactStatus(tx, row, "BOUNCED", ["SUBSCRIBED", "UNSUBSCRIBED"]);
      await addSuppressions(row.workspaceId, [{ email: row.toEmail, reason: "HARD_BOUNCE", note: `Hard bounce from the transactional email ${subject}` }], { client: tx });
    } else {
      // A complaint overrides a bounce, like for campaigns.
      changed = await tx.$executeRaw(Prisma.sql`
        UPDATE transactional_email
        SET status = 'COMPLAINED', "updatedAt" = now() AT TIME ZONE 'UTC',
            "lastError" = 'Marked as spam by the recipient. The address was added to your suppression list.'
        WHERE id = ${row.id} AND status IN ('SENT', 'BOUNCED')`);
      await setContactStatus(tx, row, "COMPLAINED", ["SUBSCRIBED", "UNSUBSCRIBED", "BOUNCED"]);
      await addSuppressions(row.workspaceId, [{ email: row.toEmail, reason: "COMPLAINT", note: `Marked the transactional email ${subject} as spam` }], { client: tx });
    }
    return changed > 0 ? "recorded" : "duplicates";
  });
}

/**
 * Same as campaigns: only from the allowed statuses (a bounce never
 * overwrites a complaint). Without a linked contact, the workspace's contact
 * with this address is updated (it may have been added after the email).
 */
async function setContactStatus(
  tx: Prisma.TransactionClient,
  row: Locked,
  to: "BOUNCED" | "COMPLAINED",
  from: ("SUBSCRIBED" | "UNSUBSCRIBED" | "BOUNCED")[],
): Promise<void> {
  const where = row.contactId ? { id: row.contactId, workspaceId: row.workspaceId } : { workspaceId: row.workspaceId, email: row.toEmail };
  await tx.contact.updateMany({ where: { ...where, status: { in: from } }, data: { status: to } });
}
