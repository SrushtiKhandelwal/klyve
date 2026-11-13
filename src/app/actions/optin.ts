"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { createRateLimiter } from "@/lib/media/rate-limit";
import {
  OPTIN_LIMITS,
  getOptInBrand,
  markContactConfirmed,
  nextOptInSendAt,
  sendOptInEmail,
  sendOptInTestEmail,
} from "@/lib/optin";
import { cleanSubject, defaultOptInMessage, defaultOptInSubject } from "@/lib/optin/email";
import { getVerifiedSender } from "@/lib/email/senders";
import { requireUser } from "@/lib/session";
import { requireActiveWorkspace } from "@/lib/workspace";

// Server Actions for double opt-in: Settings → Compliance and the
// "Awaiting confirmation" box on a contact's page.
//
// The browser can send anything, so every action:
//  - works out the workspace from the session (never from the input),
//  - checks the role where needed (settings: owners and admins),
//  - validates the input with zod.

export type OptInActionResult = { ok: true; message: string } | { ok: false; message: string };

const idSchema = z.string().trim().min(1).max(40);
const canManage = (role: string) => role === "OWNER" || role === "ADMIN";
const ADMIN_ONLY = "Only workspace owners and admins can do this.";

// ── Settings ────────────────────────────────────────────────────────────────

const settingsSchema = z.object({
  enabled: z.boolean(),
  senderId: idSchema.nullable(),
  subject: z.string().max(OPTIN_LIMITS.subject, `Keep the subject under ${OPTIN_LIMITS.subject} characters.`),
  message: z.string().max(OPTIN_LIMITS.message, `Keep the message under ${OPTIN_LIMITS.message} characters.`),
});

/** Saves the double opt-in switch, sender and email wording (owners and admins). */
export async function saveOptInSettings(input: unknown): Promise<OptInActionResult> {
  const ws = await requireActiveWorkspace();
  if (!canManage(ws.role)) return { ok: false, message: ADMIN_ONLY };

  const parsed = settingsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid settings." };
  const { enabled, senderId } = parsed.data;

  // The sender must be a VERIFIED sender of this workspace. Without one,
  // nobody could confirm, so double opt-in can't be switched on.
  const sender = senderId ? await getVerifiedSender(ws.id, senderId) : null;
  if (senderId && !sender) return { ok: false, message: "Choose one of your verified senders." };
  if (enabled && !sender) return { ok: false, message: "Choose a verified sender before turning on double opt-in." };

  // Our default wording is saved as null, so it follows the company name if
  // that changes later. Only text the user actually changed is stored.
  const { companyName } = await getOptInBrand(ws);
  const subject = cleanSubject(parsed.data.subject);
  const message = parsed.data.message.replace(/\r\n?/g, "\n").trim();

  await db.workspace.update({
    where: { id: ws.id },
    data: {
      doubleOptIn: enabled,
      optInSenderId: sender?.id ?? null,
      optInSubject: subject && subject !== defaultOptInSubject(companyName) ? subject : null,
      optInMessage: message && message !== defaultOptInMessage(companyName) ? message : null,
    },
  });
  refresh();
  return { ok: true, message: enabled ? "Saved. Double opt-in is on." : "Saved. Double opt-in is off." };
}

// "Send me a test" goes to the user's own inbox; a small limit per user stops
// it being used to spam their own (or their provider's) quota.
const store = globalThis as unknown as { klyveOptInTestLimiter?: ReturnType<typeof createRateLimiter> };
const testLimiter = (store.klyveOptInTestLimiter ??= createRateLimiter({ max: 5, windowMs: 10 * 60_000 }));

const testSchema = settingsSchema.pick({ subject: true, message: true }).extend({ senderId: idSchema });

/** Sends the confirmation email, as currently typed in the form, to the logged-in user. */
export async function sendOptInTest(input: unknown): Promise<OptInActionResult> {
  const [ws, user] = await Promise.all([requireActiveWorkspace(), requireUser()]);
  if (!canManage(ws.role)) return { ok: false, message: ADMIN_ONLY };

  const parsed = testSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Choose a verified sender first." };

  const limit = testLimiter.hit(`${user.id}`);
  if (!limit.ok) return { ok: false, message: `Too many test emails. Try again in ${Math.ceil(limit.retryAfterSeconds / 60)} min.` };

  const result = await sendOptInTestEmail(ws, { to: user.email, ...parsed.data });
  return result.ok ? { ok: true, message: `Test email sent to ${user.email}.` } : { ok: false, message: result.error };
}

// ── The contact page ────────────────────────────────────────────────────────

export type PendingInfo =
  | {
      ok: true;
      /** ISO date of the latest confirmation email, or null if none was sent. */
      sentAt: string | null;
      /** ISO date from when "Resend" works again, or null = now. */
      resendAt: string | null;
      /** Owners and admins may mark the contact as confirmed by hand. */
      canConfirm: boolean;
    }
  | { ok: false; message: string };

/** Details for the "Awaiting confirmation" box on a PENDING contact. */
export async function getPendingContactInfo(contactId: unknown): Promise<PendingInfo> {
  const ws = await requireActiveWorkspace();
  const id = idSchema.safeParse(contactId);
  if (!id.success) return { ok: false, message: "Invalid request." };
  const contact = await db.contact.findFirst({
    where: { id: id.data, workspaceId: ws.id },
    select: { id: true, status: true, optInSentAt: true },
  });
  if (!contact) return { ok: false, message: "Contact not found." };
  const resendAt = await nextOptInSendAt(ws.id, contact.id, contact.optInSentAt);
  return {
    ok: true,
    sentAt: contact.optInSentAt?.toISOString() ?? null,
    resendAt: resendAt?.toISOString() ?? null,
    canConfirm: canManage(ws.role),
  };
}

/** "Resend confirmation email" (any team member; the per-contact limits apply). */
export async function resendOptInEmail(contactId: unknown): Promise<OptInActionResult> {
  const [ws, user] = await Promise.all([requireActiveWorkspace(), requireUser()]);
  const id = idSchema.safeParse(contactId);
  if (!id.success) return { ok: false, message: "Invalid request." };
  const result = await sendOptInEmail(ws.id, id.data, { source: "manual", userId: user.id });
  if (!result.ok) return { ok: false, message: result.error };
  refresh();
  return { ok: true, message: "Confirmation email sent." };
}

/** "Mark as confirmed": PENDING → SUBSCRIBED by hand (owners and admins). */
export async function markContactAsConfirmed(contactId: unknown): Promise<OptInActionResult> {
  const [ws, user] = await Promise.all([requireActiveWorkspace(), requireUser()]);
  if (!canManage(ws.role)) return { ok: false, message: ADMIN_ONLY };
  const id = idSchema.safeParse(contactId);
  if (!id.success) return { ok: false, message: "Invalid request." };
  const result = await markContactConfirmed(ws.id, id.data, user.id);
  if (!result.ok) return { ok: false, message: result.error };
  refresh();
  return { ok: true, message: "Contact marked as subscribed." };
}
