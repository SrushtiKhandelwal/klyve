import "server-only";
import type { ContactStatus, SuppressionReason } from "@/generated/prisma/client";
import { findSuppression } from "@/lib/suppression";

// WHO MAY RECEIVE A TRANSACTIONAL EMAIL (receipts, password resets, ...)
//
// Transactional email is NOT marketing: it is something the person asked for
// by using the workspace's product. So the rules differ from campaigns:
//
//   STILL SENT
//    - contacts who UNSUBSCRIBED (they left the newsletter, not the shop:
//      they still need their receipt)
//    - addresses on the suppression list because of UNSUBSCRIBE or IMPORT
//      (both are "no marketing" lists)
//    - people who aren't contacts at all
//
//   BLOCKED (the email is stored with status SUPPRESSED, never sent)
//    - suppression reason HARD_BOUNCE: the address doesn't exist; sending
//      again hurts the sender's reputation
//    - suppression reason COMPLAINT: the person marked an email as spam
//    - suppression reason MANUAL: the workspace said "never email this"
//    - suppression reason ERASURE: the person was erased under GDPR
//    - contacts with status BOUNCED or COMPLAINED (same reasons as above)
//
// This check runs twice: when the email is accepted (send.ts) and again right
// before it is handed to the provider (deliver.ts), because a bounce or
// complaint can arrive in between.

/** Suppression reasons that block transactional email too. */
export const BLOCKING_SUPPRESSION_REASONS: ReadonlySet<SuppressionReason> = new Set<SuppressionReason>([
  "HARD_BOUNCE",
  "COMPLAINT",
  "MANUAL",
  "ERASURE",
]);

/** Contact statuses that block transactional email too. UNSUBSCRIBED and PENDING don't. */
export const BLOCKING_CONTACT_STATUSES: ReadonlySet<ContactStatus> = new Set<ContactStatus>(["BOUNCED", "COMPLAINED"]);

export type SuppressionVerdict =
  | { blocked: false }
  | {
      blocked: true;
      /** Plain-English explanation, stored in lastError and shown to the caller. */
      reason: string;
      /** The person was erased (GDPR): don't keep the email's content. */
      erased: boolean;
    };

const SUPPRESSION_MESSAGES: Record<string, string> = {
  HARD_BOUNCE:
    "Not sent: this address hard-bounced before (it doesn't exist or refuses email), so it's on your suppression list. Remove it there if you're sure it works now.",
  COMPLAINT: "Not sent: this person marked one of your emails as spam, so the address is on your suppression list.",
  MANUAL: "Not sent: this address is on your suppression list (added by your team).",
  ERASURE: "Not sent: this person's data was erased (GDPR), so the address is blocked for good.",
};

const CONTACT_MESSAGES: Record<string, string> = {
  BOUNCED: "Not sent: this contact is marked as bounced (the address doesn't accept email).",
  COMPLAINED: "Not sent: this contact marked one of your emails as spam.",
};

/**
 * May this workspace send a transactional email to this address right now?
 * `contactStatus` is the status of the workspace's contact with this
 * address, or null when there is no such contact.
 */
export async function checkTransactionalSuppression(
  workspaceId: string,
  email: string,
  contactStatus: ContactStatus | null,
): Promise<SuppressionVerdict> {
  // One indexed lookup that checks both the plain address and its erasure hash.
  const row = await findSuppression(workspaceId, email);
  if (row && BLOCKING_SUPPRESSION_REASONS.has(row.reason)) {
    return { blocked: true, reason: SUPPRESSION_MESSAGES[row.reason], erased: row.reason === "ERASURE" };
  }
  if (contactStatus && BLOCKING_CONTACT_STATUSES.has(contactStatus)) {
    return { blocked: true, reason: CONTACT_MESSAGES[contactStatus], erased: false };
  }
  return { blocked: false };
}
