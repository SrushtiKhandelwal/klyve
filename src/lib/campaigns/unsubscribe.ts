import "server-only";
import { db } from "@/lib/db";
import { getBrandTheme } from "@/lib/brand-kit";
import { normalizeEmail } from "@/lib/contacts/common";
import { createRateLimiter } from "@/lib/media/rate-limit";
import { verifyRecipientToken } from "@/lib/campaigns/tokens";
import { recordEvent } from "@/lib/tracking/record";
import type { Prisma } from "@/generated/prisma/client";

// Unsubscribe (and "oops, resubscribe me") for the PUBLIC links in campaign
// emails. Nobody is logged in on these pages, so:
//
//  - The signed token in the link is the ONLY authorization. It names exactly
//    one CampaignRecipient (one email sent to one person) and can't be forged
//    (see tokens.ts). Whoever holds it can only act on that one address.
//  - Nothing here ever reveals more than the page needs: a masked email, the
//    sender's brand and the subscription state.
//  - Unsubscribing is IDEMPOTENT: clicking twice, or Gmail's one-click POST
//    plus a click on the link, gives the same end state and no errors.
//  - BOUNCED and COMPLAINED are never overwritten. Those statuses protect the
//    sender's reputation and must stay, whatever the person clicks.

/** How long after unsubscribing the same link may undo it. */
export const RESUBSCRIBE_WINDOW_DAYS = 30;
const RESUBSCRIBE_WINDOW_MS = RESUBSCRIBE_WINDOW_DAYS * 24 * 60 * 60 * 1000;

export type UnsubscribeFailure = "invalid";

export type UnsubscribeResult =
  | { ok: true; alreadyUnsubscribed: boolean; email: string; workspaceName: string }
  | { ok: false; reason: UnsubscribeFailure };

export type ResubscribeResult =
  | { ok: true; email: string; workspaceName: string }
  | { ok: false; reason: "invalid" | "not_unsubscribed" | "expired" | "blocked" | "no_contact" };

/**
 * What the public page shows. "blocked" = the address bounced or complained,
 * so it can't receive email from this workspace whatever the person wants.
 */
export type SubscriptionState = "subscribed" | "unsubscribed" | "blocked";

export type UnsubscribeContext =
  | {
      ok: true;
      email: string;
      state: SubscriptionState;
      /** True when the "Resubscribe" button may be shown (30-day rule etc.). */
      canResubscribe: boolean;
      brand: { name: string; logoUrl: string | null; primaryColor: string };
    }
  | { ok: false };

// ── Helpers ──────────────────────────────────────────────────────────────────

/** "priya@gmail.com" → "p•••@gmail.com". Enough to recognise, not to harvest. */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf("@");
  if (at <= 0) return "•••";
  return `${email[0]}•••${email.slice(at)}`;
}

type Tx = Prisma.TransactionClient;

/** The recipient row + its workspace. Only the fields we need. */
function loadRecipient(tx: Tx, recipientId: string) {
  return tx.campaignRecipient.findUnique({
    where: { id: recipientId },
    select: {
      id: true,
      email: true,
      contactId: true,
      unsubscribedAt: true,
      campaign: { select: { workspaceId: true, workspace: { select: { id: true, name: true } } } },
    },
  });
}

/**
 * The contact this email went to.
 *
 * Normally that's `contactId`. If the contact was DELETED after sending
 * (contactId is now null), we look the address up in the same workspace by
 * email instead. Why: the person clicking owns that inbox and has asked for no
 * more email. If the workspace re-added them since (e.g. a new CSV import),
 * that new contact must honour the request too. Only the same workspace is
 * searched, never another tenant's contacts.
 */
function findContact(tx: Tx, workspaceId: string, recipient: { contactId: string | null; email: string }) {
  const select = { id: true, status: true } as const;
  return recipient.contactId
    ? tx.contact.findFirst({ where: { id: recipient.contactId, workspaceId }, select })
    : tx.contact.findUnique({
        where: { workspaceId_email: { workspaceId, email: normalizeEmail(recipient.email) } },
        select,
      });
}

// ── Unsubscribe ──────────────────────────────────────────────────────────────

/**
 * Unsubscribes the person an unsubscribe token belongs to.
 * Safe to call any number of times. Invalid/forged tokens change nothing.
 */
export async function unsubscribeByToken(token: string): Promise<UnsubscribeResult> {
  const recipientId = verifyRecipientToken(token, "unsubscribe");
  if (!recipientId) return { ok: false, reason: "invalid" };

  // One transaction: the contact's status and the recipient's timestamp
  // change together or not at all.
  const result = await db.$transaction(async (tx) => {
    const recipient = await loadRecipient(tx, recipientId);
    if (!recipient) return { ok: false, reason: "invalid" } as const;
    const { workspace, workspaceId } = recipient.campaign;

    const contact = await findContact(tx, workspaceId, recipient);
    // Conditional update ("only if SUBSCRIBED"): never overwrites BOUNCED or
    // COMPLAINED, and two clicks at the same moment can't both "win".
    const contactChanged = contact
      ? (
          await tx.contact.updateMany({
            where: { id: contact.id, workspaceId, status: "SUBSCRIBED" },
            data: { status: "UNSUBSCRIBED" },
          })
        ).count > 0
      : false;

    // Remember that THIS email's link was used (for reports and the 30-day
    // resubscribe rule). The first time only, so the date doesn't move.
    const recipientChanged =
      (
        await tx.campaignRecipient.updateMany({
          where: { id: recipient.id, unsubscribedAt: null },
          data: { unsubscribedAt: new Date() },
        })
      ).count > 0;

    return {
      ok: true,
      alreadyUnsubscribed: !contactChanged && !recipientChanged,
      email: maskEmail(recipient.email),
      workspaceName: workspace.name,
    } as const;
  });

  // A NEW unsubscribe goes into the campaign's report (event + counter).
  // After the transaction, and never allowed to fail the unsubscribe itself:
  // the person's request is what matters. recordEvent counts each email once.
  if (result.ok && !result.alreadyUnsubscribed) {
    await recordEvent({ recipientId, type: "UNSUBSCRIBED" }).catch((error: unknown) => {
      console.error("[unsubscribe] couldn't record the unsubscribe event:", error);
    });
  }
  return result;
}

/**
 * Undoes a mistaken unsubscribe.
 *
 * Why this is safe without a login: only the holder of this person's unique
 * (signed) email link can call it, the same proof of inbox ownership the
 * unsubscribe itself relies on. On top of that it is narrow:
 *  - only within 30 days of THIS link's own unsubscribe,
 *  - only if the contact is UNSUBSCRIBED now (never revives a BOUNCED or
 *    COMPLAINED address, which would hurt the sender's reputation).
 */
export async function resubscribeByToken(token: string): Promise<ResubscribeResult> {
  const recipientId = verifyRecipientToken(token, "unsubscribe");
  if (!recipientId) return { ok: false, reason: "invalid" };

  return db.$transaction(async (tx) => {
    const recipient = await loadRecipient(tx, recipientId);
    if (!recipient) return { ok: false, reason: "invalid" } as const;
    const { workspace, workspaceId } = recipient.campaign;

    if (!recipient.unsubscribedAt) return { ok: false, reason: "not_unsubscribed" } as const;
    if (Date.now() - recipient.unsubscribedAt.getTime() > RESUBSCRIBE_WINDOW_MS) {
      return { ok: false, reason: "expired" } as const;
    }

    const contact = await findContact(tx, workspaceId, recipient);
    if (!contact) return { ok: false, reason: "no_contact" } as const;
    if (contact.status === "BOUNCED" || contact.status === "COMPLAINED") {
      return { ok: false, reason: "blocked" } as const;
    }

    // Conditional again: if something changed the status meanwhile (e.g. a
    // bounce was recorded), we leave it alone.
    await tx.contact.updateMany({
      where: { id: contact.id, workspaceId, status: "UNSUBSCRIBED" },
      data: { status: "SUBSCRIBED" },
    });
    // The click is undone, so it no longer counts as this campaign's
    // unsubscribe (and the page goes back to its "Unsubscribe?" state).
    await tx.campaignRecipient.update({ where: { id: recipient.id }, data: { unsubscribedAt: null } });

    return { ok: true, email: maskEmail(recipient.email), workspaceName: workspace.name } as const;
  });
}

// ── What the page shows ──────────────────────────────────────────────────────

/**
 * Everything the /u/<token> page needs, and nothing more: the sender's brand,
 * the masked address and the current state. `{ ok: false }` for any invalid
 * token, without saying why (no hints for someone guessing tokens).
 */
export async function getUnsubscribeContext(token: string): Promise<UnsubscribeContext> {
  const recipientId = verifyRecipientToken(token, "unsubscribe");
  if (!recipientId) return { ok: false };

  const recipient = await loadRecipient(db, recipientId);
  if (!recipient) return { ok: false };
  const { workspace, workspaceId } = recipient.campaign;

  const [contact, theme] = await Promise.all([
    findContact(db, workspaceId, recipient),
    getBrandTheme({ id: workspace.id, name: workspace.name }),
  ]);

  let state: SubscriptionState;
  if (contact?.status === "BOUNCED" || contact?.status === "COMPLAINED") state = "blocked";
  else if (contact?.status === "UNSUBSCRIBED") state = "unsubscribed";
  else if (contact?.status === "SUBSCRIBED") state = "subscribed";
  // Contact deleted and not re-added: this link's own record decides.
  else state = recipient.unsubscribedAt ? "unsubscribed" : "subscribed";

  const canResubscribe =
    state === "unsubscribed" &&
    !!contact &&
    !!recipient.unsubscribedAt &&
    Date.now() - recipient.unsubscribedAt.getTime() <= RESUBSCRIBE_WINDOW_MS;

  return {
    ok: true,
    email: maskEmail(recipient.email),
    state,
    canResubscribe,
    brand: {
      // getBrandTheme falls back to the workspace name when no company name is set.
      name: theme.companyName,
      logoUrl: theme.logoUrl,
      primaryColor: theme.primaryColor,
    },
  };
}

// ── Rate limiting for the public endpoints ───────────────────────────────────

// A light per-IP limit on the public unsubscribe endpoints, so nobody can
// hammer them while guessing tokens. Generous, because a whole office behind
// one IP may click links at once. Kept on globalThis so dev reloads keep it.
const globalForUnsub = globalThis as unknown as { unsubscribeLimiter?: ReturnType<typeof createRateLimiter> };
export const unsubscribeRateLimiter = (globalForUnsub.unsubscribeLimiter ??= createRateLimiter({
  max: 60,
  windowMs: 60_000,
}));

/** The visitor's IP from proxy headers ("unknown" if there are none). */
export function clientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || headers.get("x-real-ip")?.trim() || "unknown";
}
