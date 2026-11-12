"use server";

import { refresh } from "next/cache";
import { emailSchema } from "@/lib/contacts/common";
import { db } from "@/lib/db";
import { getVerifiedSender } from "@/lib/email/senders";
import { getDefaultProvider, sendWithStoredProvider } from "@/lib/email/stored-provider";
import { TemplateError, buildMergeData, personalize } from "@/lib/templates/personalize";
import {
  createTemplate,
  deleteTemplate,
  duplicateTemplate,
  getTemplate,
  getTemplateThumbnails,
  renameTemplate,
  saveTemplate,
} from "@/lib/templates/queries";
import { renderDocument } from "@/lib/templates/render";
import { SAMPLE_CONTACT } from "@/lib/templates/sample-data";
import { requireUser } from "@/lib/session";
import { requireActiveWorkspace } from "@/lib/workspace";

// Server Actions for Templates. Anyone can call these with any input, so each
// one checks login + workspace itself, and every id from the browser is only
// used TOGETHER with the active workspace's id (another workspace's id simply
// finds nothing).
//
// WHO CAN DO WHAT
// - Any member: create, edit, rename, duplicate and send test emails.
// - Delete: OWNER/ADMIN can delete any template; a MEMBER only templates they
//   created themselves (see canDeleteTemplate in queries.ts).

export type ActionResult<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const SERVER_ERROR = "Something went wrong. Please try again.";
const str = (v: unknown) => (typeof v === "string" ? v : "");

/** Creates a template (blank, or from a starter) and returns its id so the page can open the editor. */
export async function createTemplateAction(input: unknown): Promise<ActionResult<{ templateId: string }>> {
  const [ws, user] = await Promise.all([requireActiveWorkspace(), requireUser()]);
  const v = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  try {
    // Only these fields are accepted; a raw `document` from the browser isn't
    // needed here (the editor saves through saveTemplateAction).
    const result = await createTemplate(ws, user.id, { name: v.name, starterId: v.starterId || undefined });
    if (result.ok) refresh();
    return result;
  } catch (error) {
    console.error("createTemplateAction failed:", error);
    return { ok: false, error: SERVER_ERROR };
  }
}

/** The editor's Save. No refresh(): the editor already shows what was saved. */
export async function saveTemplateAction(
  templateId: unknown,
  input: unknown,
): Promise<ActionResult<{ warnings: string[] }>> {
  const ws = await requireActiveWorkspace();
  const v = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  try {
    const result = await saveTemplate(ws.id, str(templateId), {
      document: v.document,
      subject: v.subject,
      preheader: v.preheader,
    });
    return result.ok ? { ok: true, warnings: result.warnings } : result;
  } catch (error) {
    console.error("saveTemplateAction failed:", error);
    return { ok: false, error: "Couldn't save the template. Please try again." };
  }
}

export async function renameTemplateAction(templateId: unknown, name: unknown): Promise<ActionResult> {
  const ws = await requireActiveWorkspace();
  try {
    const result = await renameTemplate(ws.id, str(templateId), name);
    if (result.ok) refresh();
    return result;
  } catch (error) {
    console.error("renameTemplateAction failed:", error);
    return { ok: false, error: SERVER_ERROR };
  }
}

export async function duplicateTemplateAction(templateId: unknown): Promise<ActionResult<{ templateId: string }>> {
  const [ws, user] = await Promise.all([requireActiveWorkspace(), requireUser()]);
  try {
    const result = await duplicateTemplate(ws.id, user.id, str(templateId));
    if (result.ok) refresh();
    return result;
  } catch (error) {
    console.error("duplicateTemplateAction failed:", error);
    return { ok: false, error: SERVER_ERROR };
  }
}

export async function deleteTemplateAction(templateId: unknown): Promise<ActionResult> {
  const [ws, user] = await Promise.all([requireActiveWorkspace(), requireUser()]);
  try {
    const result = await deleteTemplate(ws.id, str(templateId), { userId: user.id, role: ws.role });
    if (result.ok) refresh();
    return result;
  } catch (error) {
    console.error("deleteTemplateAction failed:", error);
    return { ok: false, error: SERVER_ERROR };
  }
}

/** Stored HTML for the small previews on the templates page (up to 24 at a time). */
export async function loadTemplateThumbnails(templateIds: unknown): Promise<Record<string, string>> {
  const ws = await requireActiveWorkspace();
  if (!Array.isArray(templateIds)) return {};
  return getTemplateThumbnails(ws.id, templateIds.map(str));
}

// ── Test emails ─────────────────────────────────────────────────────────────

const TEST_LIMIT = { perHour: 20, windowMs: 60 * 60 * 1000 } as const;

// In-memory sliding window: for each user, the times of their recent test
// sends. Simple and good enough for one server. Limits reset when the server
// restarts, and with several servers each one counts separately; a shared
// store (database/Redis) would be needed for a strict global limit.
// Kept on globalThis so editing code in development doesn't reset it.
const testSendLog: Map<string, number[]> = ((globalThis as { __klyveTestSends?: Map<string, number[]> }).__klyveTestSends ??=
  new Map());

/** Records one attempt and says whether it's allowed. */
function takeTestSendSlot(userId: string): { ok: true } | { ok: false; retryInMinutes: number } {
  const now = Date.now();
  const recent = (testSendLog.get(userId) ?? []).filter((t) => now - t < TEST_LIMIT.windowMs);
  if (recent.length >= TEST_LIMIT.perHour) {
    testSendLog.set(userId, recent);
    const retryInMinutes = Math.max(1, Math.ceil((recent[0] + TEST_LIMIT.windowMs - now) / 60_000));
    return { ok: false, retryInMinutes };
  }
  recent.push(now);
  testSendLog.set(userId, recent);
  return { ok: true };
}

/** Placeholder unsubscribe link in test emails: clicking it does nothing (no real contact to unsubscribe). */
const TEST_UNSUBSCRIBE_URL = "#unsubscribe-link-(test)";

/**
 * Sends the template's last SAVED version to one address, as a test.
 * - Personalized as the contact with that email (if they're in this workspace), else a sample contact.
 * - Subject starts with "[Test] ". The unsubscribe link is a placeholder.
 * - Sent from a VERIFIED sender of this workspace, through that sender's provider.
 * - At most 20 test emails per user per hour.
 */
export async function sendTemplateTest(templateId: unknown, input: unknown): Promise<ActionResult<{ to: string }>> {
  const [ws, user] = await Promise.all([requireActiveWorkspace(), requireUser()]);
  const v = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;

  const to = emailSchema.safeParse(v.to);
  if (!to.success) return { ok: false, error: to.error.issues[0]?.message ?? "Please enter a valid email address." };

  try {
    const [template, sender] = await Promise.all([
      getTemplate(ws.id, str(templateId)),
      getVerifiedSender(ws.id, str(v.senderId)),
    ]);
    if (!template) return { ok: false, error: "This template doesn't exist (or was deleted)." };
    if (!sender) return { ok: false, error: "Pick a verified sender. You can verify one in Settings → Senders." };

    const providerId = sender.providerId ?? (await getDefaultProvider(ws.id))?.id;
    if (!providerId) {
      return { ok: false, error: "This sender has no email provider. Connect one in Settings → Providers." };
    }

    // Counted only once the request is valid, so typos don't use up the limit.
    const slot = takeTestSendSlot(user.id);
    if (!slot.ok) {
      return {
        ok: false,
        error: `You've sent ${TEST_LIMIT.perHour} test emails in the last hour. Try again in ${slot.retryInMinutes} min.`,
      };
    }

    // Render fresh from the saved design (always matches the current renderer).
    const rendered = await renderDocument(template.document, { subject: template.subject, preheader: template.preheader });

    // Personalize as the real contact if this address is one of ours, so the
    // test shows exactly what they'd get. Filtered by workspace, of course.
    const contact = await db.contact.findUnique({
      where: { workspaceId_email: { workspaceId: ws.id, email: to.data } },
      select: { email: true, firstName: true, lastName: true, attributes: true },
    });
    const data = buildMergeData(contact ?? SAMPLE_CONTACT, {
      unsubscribeUrl: TEST_UNSUBSCRIBE_URL,
      workspaceName: ws.name,
    });
    let filled;
    try {
      filled = personalize({ html: rendered.html, text: rendered.text, subject: template.subject || template.name }, data);
    } catch (error) {
      // A broken merge tag (e.g. a missing "}}"): the message says where.
      if (error instanceof TemplateError) return { ok: false, error: error.message };
      throw error;
    }

    const result = await sendWithStoredProvider(ws.id, providerId, {
      from: { email: sender.email, name: sender.name },
      to: { email: to.data },
      replyTo: sender.replyTo ?? undefined,
      subject: `[Test] ${filled.subject}`.slice(0, 250),
      html: filled.html,
      text: filled.text,
      tags: { kind: "template-test" },
    });
    if (!result.ok) return { ok: false, error: `The email provider said: ${result.error}` };
    return { ok: true, to: to.data };
  } catch (error) {
    console.error("sendTemplateTest failed:", error);
    return { ok: false, error: "Couldn't send the test email. Please try again." };
  }
}

