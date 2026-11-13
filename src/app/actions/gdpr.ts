"use server";

import { redirect, RedirectType } from "next/navigation";
import { z } from "zod";
import { normalizeEmail } from "@/lib/contacts/common";
import { listConsentEvents } from "@/lib/consent";
import { db } from "@/lib/db";
import { canManagePrivacy } from "@/lib/gdpr/access";
import { toConsentPageView, type ConsentPageView } from "@/lib/gdpr/consent-view";
import { eraseContact } from "@/lib/gdpr/erase";
import { requireUser } from "@/lib/session";
import { requireActiveWorkspace } from "@/lib/workspace";

// Server Actions for the GDPR tools on the contact page. Server Actions are
// public endpoints, so each one re-checks the login, the workspace, the
// role and its input, and filters every query by the active workspace.

const idSchema = z.string().trim().min(1).max(64);

const eraseSchema = z.object({
  contactId: idSchema,
  /** The user must type the contact's email, so an erasure is never a slip of the mouse. */
  confirmEmail: z.string().max(320),
  keepSuppressed: z.boolean().default(true),
});

export type EraseActionResult = { ok: false; error: string };

/**
 * Erases ("forgets") a contact. OWNER/ADMIN only. On success it redirects
 * to /contacts (so it only returns on failure).
 */
export async function eraseContactAction(input: unknown): Promise<EraseActionResult> {
  const user = await requireUser();
  const ws = await requireActiveWorkspace();
  if (!canManagePrivacy(ws.role)) return { ok: false, error: "Only owners and admins can erase a contact." };

  const parsed = eraseSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  const { contactId, confirmEmail, keepSuppressed } = parsed.data;

  const contact = await db.contact.findFirst({ where: { id: contactId, workspaceId: ws.id }, select: { email: true } });
  if (!contact) return { ok: false, error: "Contact not found." };
  if (normalizeEmail(confirmEmail) !== contact.email) {
    return { ok: false, error: "The email you typed doesn't match this contact." };
  }

  try {
    const result = await eraseContact(ws.id, contactId, { userId: user.id, keepSuppressed });
    if (!result.ok) return { ok: false, error: result.error };
  } catch (error) {
    // Nothing was changed: the erasure runs in one transaction.
    console.error("eraseContact failed:", error instanceof Error ? error.message : error);
    return { ok: false, error: "Couldn't erase this contact. Nothing was changed. Please try again." };
  }

  // Outside the try: redirect() works by throwing. "replace" so Back doesn't
  // return to a contact page that no longer exists.
  redirect("/contacts", RedirectType.replace);
}

const consentPageSchema = z.object({ contactId: idSchema, cursor: z.string().min(1).max(64) });

export type ConsentPageResult = { ok: true; page: ConsentPageView } | { ok: false; error: string };

/** The next (older) page of a contact's consent history, for "Load more". Any member may view it. */
export async function loadConsentHistory(input: unknown): Promise<ConsentPageResult> {
  const ws = await requireActiveWorkspace();
  const parsed = consentPageSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };

  try {
    // listConsentEvents filters by workspace: another workspace's contact gives no rows.
    const page = await listConsentEvents(ws.id, parsed.data.contactId, { cursor: parsed.data.cursor });
    return { ok: true, page: toConsentPageView(page) };
  } catch (error) {
    console.error("loadConsentHistory failed:", error instanceof Error ? error.message : error);
    return { ok: false, error: "Couldn't load more history. Please try again." };
  }
}
