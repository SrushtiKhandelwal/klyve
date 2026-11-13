"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { emailSchema } from "@/lib/contacts/common";
import { getVerifiedSender } from "@/lib/email/senders";
import { getDefaultProvider, sendWithStoredProvider } from "@/lib/email/stored-provider";
import {
  activateAutomation,
  deleteAutomation,
  enrollContacts,
  pauseAutomation,
  saveAutomationDraft,
} from "@/lib/automations/lifecycle";
import {
  MANUAL_ENROLL_CAP,
  createAutomation,
  duplicateAutomation,
  getAutomation,
  listContactIdsForEnrolment,
  renameAutomation,
} from "@/lib/automations/queries";
import { flattenSteps, stepsSchema, triggerSchema, type AutomationStep } from "@/lib/automations/schema";
// Shared with the builder so both sides agree on the size limit.
import { MAX_WORKFLOW_BYTES } from "@/components/automations/builder/checks";
import { getSegmentContactIds } from "@/lib/segments/engine";
import { getSegment } from "@/lib/segments/queries";
import { emailDocumentSchema } from "@/lib/templates/document";
import { TemplateError, buildMergeData, personalize } from "@/lib/templates/personalize";
import { renderDocument } from "@/lib/templates/render";
import { SAMPLE_CONTACT } from "@/lib/templates/sample-data";
import { requireUser } from "@/lib/session";
import { requireActiveWorkspace, type ActiveWorkspace } from "@/lib/workspace";

// Server Actions for the automation builder. Anyone can call these with any
// input, so each one checks login + workspace itself and validates its input,
// and every id from the browser is only used TOGETHER with the active
// workspace's id (another workspace's automation simply isn't found).
//
// WHO CAN DO WHAT
// - Any member: create, edit drafts/paused ones, rename, duplicate, add
//   people by hand, send test emails.
// - OWNER/ADMIN only: activate, pause and delete. Turning an automation on
//   starts emailing real people without anyone pressing "send", so it's
//   treated like the most powerful campaign action.

export type AutomationActionResult<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const SERVER_ERROR = "Something went wrong. Please try again.";
const NOT_ALLOWED = "Only workspace owners and admins can do this.";
const idSchema = z.string().min(1).max(64);

const canManage = (ws: ActiveWorkspace) => ws.role === "OWNER" || ws.role === "ADMIN";


// ── Create / duplicate / rename ─────────────────────────────────────────────

/** Creates a draft (blank, or from a ready-made recipe) and returns its id so the page can open the builder. */
export async function createAutomationAction(input: unknown): Promise<AutomationActionResult<{ automationId: string }>> {
  const [ws, user] = await Promise.all([requireActiveWorkspace(), requireUser()]);
  const parsed = z
    .object({ name: z.string().max(500).optional(), recipeId: z.string().max(64).optional() })
    .safeParse(input ?? {});
  if (!parsed.success) return { ok: false, error: "These details couldn't be read. Please try again." };
  try {
    const result = await createAutomation(ws, user.id, parsed.data);
    if (result.ok) refresh();
    return result;
  } catch (error) {
    console.error("createAutomationAction failed:", error);
    return { ok: false, error: SERVER_ERROR };
  }
}

/**
 * The "Create" button on /automations/new?recipe=… (a real POST form, so
 * nothing is created just by opening a link). Opens the builder on success.
 */
export async function createAutomationFromForm(_prev: { error: string } | null, formData: FormData): Promise<{ error: string }> {
  const [ws, user] = await Promise.all([requireActiveWorkspace(), requireUser()]);
  const recipeId = formData.get("recipeId");
  const name = formData.get("name");
  let automationId: string;
  try {
    const result = await createAutomation(ws, user.id, {
      recipeId: typeof recipeId === "string" ? recipeId.slice(0, 64) : undefined,
      name: typeof name === "string" ? name.slice(0, 500) : undefined,
    });
    if (!result.ok) return { error: result.error };
    automationId = result.automationId;
  } catch (error) {
    console.error("createAutomationFromForm failed:", error);
    return { error: SERVER_ERROR };
  }
  // redirect() works by throwing, so it must be outside the try/catch.
  redirect(`/automations/${automationId}`);
}

export async function duplicateAutomationAction(automationId: unknown): Promise<AutomationActionResult<{ automationId: string }>> {
  const [ws, user] = await Promise.all([requireActiveWorkspace(), requireUser()]);
  const id = idSchema.safeParse(automationId);
  if (!id.success) return { ok: false, error: "This automation doesn't exist (or was deleted)." };
  try {
    const result = await duplicateAutomation(ws, user.id, id.data);
    if (result.ok) refresh();
    return result;
  } catch (error) {
    console.error("duplicateAutomationAction failed:", error);
    return { ok: false, error: SERVER_ERROR };
  }
}

export async function renameAutomationAction(automationId: unknown, name: unknown): Promise<AutomationActionResult> {
  const ws = await requireActiveWorkspace();
  const id = idSchema.safeParse(automationId);
  if (!id.success) return { ok: false, error: "This automation doesn't exist (or was deleted)." };
  try {
    const result = await renameAutomation(ws, id.data, name);
    if (result.ok) refresh();
    return result;
  } catch (error) {
    console.error("renameAutomationAction failed:", error);
    return { ok: false, error: SERVER_ERROR };
  }
}

// ── Saving the workflow ─────────────────────────────────────────────────────

const savePatchSchema = z
  .object({
    trigger: z.unknown().optional(),
    steps: z.unknown().optional(),
    allowReentry: z.boolean().optional(),
  })
  .strict();

/** Line breaks in a subject could sneak extra email headers in, so they're refused. */
const hasControlChars = (v: string) => [...v].some((ch) => ch.charCodeAt(0) < 0x20 || ch.charCodeAt(0) === 0x7f);

/** The first reason these steps can't be stored, or null. Also used by the email design page. */
function checkSteps(input: unknown): { ok: true; steps: AutomationStep[] } | { ok: false; error: string } {
  let size: number;
  try {
    size = Buffer.byteLength(JSON.stringify(input) ?? "", "utf8");
  } catch {
    return { ok: false, error: "These steps couldn't be read." };
  }
  if (size > MAX_WORKFLOW_BYTES) {
    return { ok: false, error: "This automation is too big to save. Remove some steps or make the email designs smaller." };
  }
  const parsed = stepsSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    console.warn("Invalid automation steps:", issue?.path.join("."), issue?.message);
    return { ok: false, error: `A step isn't valid: ${issue?.message ?? "unknown problem"}` };
  }
  for (const s of flattenSteps(parsed.data)) {
    if (s.type === "send_email" && (hasControlChars(s.subject) || hasControlChars(s.preheader) || hasControlChars(s.name))) {
      return { ok: false, error: `“${s.name.replace(/[\r\n]/g, " ")}”: the name, subject and preview text can't contain line breaks.` };
    }
  }
  return { ok: true, steps: parsed.data };
}

/**
 * The builder's autosave (trigger, steps, re-entry). Only DRAFT or PAUSED
 * automations can change; lifecycle.ts enforces that too. No refresh(): the
 * builder already shows what was saved.
 */
export async function saveAutomationAction(automationId: unknown, patch: unknown): Promise<AutomationActionResult> {
  const ws = await requireActiveWorkspace();
  const id = idSchema.safeParse(automationId);
  const parsed = savePatchSchema.safeParse(patch);
  if (!id.success || !parsed.success) return { ok: false, error: "These changes couldn't be read. Please reload the page." };

  const update: { trigger?: z.infer<typeof triggerSchema>; steps?: AutomationStep[]; allowReentry?: boolean } = {};
  if (parsed.data.trigger !== undefined) {
    const t = triggerSchema.safeParse(parsed.data.trigger);
    if (!t.success) return { ok: false, error: "The trigger isn't complete yet." };
    update.trigger = t.data;
  }
  if (parsed.data.steps !== undefined) {
    const s = checkSteps(parsed.data.steps);
    if (!s.ok) return s;
    update.steps = s.steps;
  }
  if (parsed.data.allowReentry !== undefined) update.allowReentry = parsed.data.allowReentry;
  if (Object.keys(update).length === 0) return { ok: true };

  try {
    const result = await saveAutomationDraft(ws, id.data, update);
    return result.ok ? { ok: true } : { ok: false, error: result.error };
  } catch (error) {
    console.error("saveAutomationAction failed:", error);
    return { ok: false, error: "Couldn't save the automation. Please try again." };
  }
}

/**
 * Saves the design of ONE "Send email" step (from the full-screen editor),
 * plus its subject and preview text. Everything else in the workflow stays
 * exactly as stored.
 */
export async function saveStepEmailAction(automationId: unknown, stepId: unknown, input: unknown): Promise<AutomationActionResult> {
  const ws = await requireActiveWorkspace();
  const id = idSchema.safeParse(automationId);
  const sid = idSchema.safeParse(stepId);
  const v = z
    .object({ document: z.unknown(), subject: z.string().max(1000), preheader: z.string().max(1000) })
    .safeParse(input);
  if (!id.success || !sid.success || !v.success) return { ok: false, error: "These changes couldn't be read. Please reload the page." };

  const doc = emailDocumentSchema.safeParse(v.data.document);
  if (!doc.success) return { ok: false, error: `This design has a problem: ${doc.error.issues[0]?.message ?? "unknown"}` };

  try {
    const automation = await getAutomation(ws, id.data);
    if (!automation) return { ok: false, error: "This automation doesn't exist (or was deleted)." };
    if (automation.status === "ACTIVE") return { ok: false, error: "This automation is on. Pause it to edit its emails." };

    let found = false;
    const replace = (list: AutomationStep[]): AutomationStep[] =>
      list.map((s): AutomationStep => {
        if (s.id === sid.data && s.type === "send_email") {
          found = true;
          return { ...s, document: doc.data, subject: v.data.subject.trim(), preheader: v.data.preheader.trim() };
        }
        return s.type === "condition" ? { ...s, yes: replace(s.yes), no: replace(s.no) } : s;
      });
    const steps = replace(automation.steps);
    if (!found) return { ok: false, error: "This email step no longer exists. It may have been deleted in the builder." };

    const checked = checkSteps(steps);
    if (!checked.ok) return checked;
    const result = await saveAutomationDraft(ws, automation.id, { steps: checked.steps });
    return result.ok ? { ok: true } : { ok: false, error: result.error };
  } catch (error) {
    console.error("saveStepEmailAction failed:", error);
    return { ok: false, error: "Couldn't save the email. Please try again." };
  }
}

// ── On / off / delete (OWNER/ADMIN) ─────────────────────────────────────────

export type ActivateResult = { ok: true } | { ok: false; error?: string; problems?: string[] };

/** Turns the automation on, or returns the list of things to fix first. */
export async function activateAutomationAction(automationId: unknown): Promise<ActivateResult> {
  const [ws, user] = await Promise.all([requireActiveWorkspace(), requireUser()]);
  if (!canManage(ws)) return { ok: false, error: NOT_ALLOWED };
  const id = idSchema.safeParse(automationId);
  if (!id.success) return { ok: false, error: "This automation doesn't exist (or was deleted)." };
  try {
    const result = await activateAutomation(ws, id.data, user.id);
    if (result.ok) {
      refresh();
      return { ok: true };
    }
    return { ok: false, problems: result.problems };
  } catch (error) {
    console.error("activateAutomationAction failed:", error);
    return { ok: false, error: SERVER_ERROR };
  }
}

export async function pauseAutomationAction(automationId: unknown): Promise<AutomationActionResult> {
  const ws = await requireActiveWorkspace();
  if (!canManage(ws)) return { ok: false, error: NOT_ALLOWED };
  const id = idSchema.safeParse(automationId);
  if (!id.success) return { ok: false, error: "This automation doesn't exist (or was deleted)." };
  try {
    const result = await pauseAutomation(ws, id.data);
    if (result.ok) refresh();
    return result;
  } catch (error) {
    console.error("pauseAutomationAction failed:", error);
    return { ok: false, error: SERVER_ERROR };
  }
}

export async function deleteAutomationAction(automationId: unknown): Promise<AutomationActionResult> {
  const ws = await requireActiveWorkspace();
  if (!canManage(ws)) return { ok: false, error: NOT_ALLOWED };
  const id = idSchema.safeParse(automationId);
  if (!id.success) return { ok: false, error: "This automation doesn't exist (or was deleted)." };
  try {
    // Workspace-scoped inside: another workspace's id is "not found".
    const result = await deleteAutomation(ws, id.data);
    if (!result.ok) return { ok: false, error: result.error };
    refresh();
    return { ok: true };
  } catch (error) {
    console.error("deleteAutomationAction failed:", error);
    return { ok: false, error: SERVER_ERROR };
  }
}

// ── Adding people by hand ───────────────────────────────────────────────────

const enrollSchema = z.object({ source: z.enum(["list", "segment"]), id: idSchema });

/**
 * Puts everyone in a list or segment (of THIS workspace) into the automation
 * now. Contact ids are worked out here on the server, never sent by the browser.
 */
export async function enrollPeopleAction(
  automationId: unknown,
  input: unknown,
): Promise<AutomationActionResult<{ enrolled: number; skipped: number }>> {
  const ws = await requireActiveWorkspace();
  const id = idSchema.safeParse(automationId);
  const v = enrollSchema.safeParse(input);
  if (!id.success || !v.success) return { ok: false, error: "Choose a list or segment first." };

  try {
    const automation = await getAutomation(ws, id.data);
    if (!automation) return { ok: false, error: "This automation doesn't exist (or was deleted)." };
    if (automation.status !== "ACTIVE") return { ok: false, error: "Turn the automation on first, then add people." };

    let contactIds: string[] | null;
    if (v.data.source === "list") {
      contactIds = await listContactIdsForEnrolment(ws, v.data.id);
      if (!contactIds) return { ok: false, error: "That list wasn't found." };
    } else {
      const segment = await getSegment(ws.id, v.data.id);
      if (!segment) return { ok: false, error: "That segment wasn't found." };
      contactIds = (await getSegmentContactIds(ws.id, segment.rules, { take: MANUAL_ENROLL_CAP + 1 })).ids;
    }

    if (contactIds.length > MANUAL_ENROLL_CAP) {
      return {
        ok: false,
        error: `That's more than ${MANUAL_ENROLL_CAP.toLocaleString("en")} people. You can add up to ${MANUAL_ENROLL_CAP.toLocaleString("en")} at a time: pick a smaller list or segment.`,
      };
    }
    if (contactIds.length === 0) return { ok: false, error: "Nobody to add: there are no subscribed contacts there." };

    const result = await enrollContacts(ws, automation.id, contactIds, { source: "manual" });
    if (result.error) return { ok: false, error: result.error };
    refresh();
    return { ok: true, enrolled: result.enrolled, skipped: result.skipped };
  } catch (error) {
    console.error("enrollPeopleAction failed:", error);
    return { ok: false, error: SERVER_ERROR };
  }
}

// ── Test emails ─────────────────────────────────────────────────────────────

const TEST_LIMIT = { perHour: 20, windowMs: 60 * 60 * 1000 } as const;

// In-memory, per user: good enough for one server (same approach as template
// tests; see actions/templates.ts). Kept on globalThis so dev reloads keep it.
const testSendLog: Map<string, number[]> = ((globalThis as { __klyveAutomationTests?: Map<string, number[]> }).__klyveAutomationTests ??=
  new Map());

function takeTestSendSlot(userId: string): boolean {
  const now = Date.now();
  const recent = (testSendLog.get(userId) ?? []).filter((t) => now - t < TEST_LIMIT.windowMs);
  if (recent.length >= TEST_LIMIT.perHour) {
    testSendLog.set(userId, recent);
    return false;
  }
  recent.push(now);
  testSendLog.set(userId, recent);
  return true;
}

/**
 * Sends one "Send email" step's last SAVED version to one address, as a test:
 * "[Test] " subject, placeholder unsubscribe link, personalised as the contact
 * with that address (if they're in this workspace) or a sample contact.
 */
export async function sendStepTestAction(
  automationId: unknown,
  stepId: unknown,
  input: unknown,
): Promise<AutomationActionResult<{ to: string }>> {
  const [ws, user] = await Promise.all([requireActiveWorkspace(), requireUser()]);
  const id = idSchema.safeParse(automationId);
  const sid = idSchema.safeParse(stepId);
  const v = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const to = emailSchema.safeParse(v.to);
  if (!id.success || !sid.success) return { ok: false, error: "This email step wasn't found." };
  if (!to.success) return { ok: false, error: to.error.issues[0]?.message ?? "Please enter a valid email address." };

  try {
    const automation = await getAutomation(ws, id.data);
    const step = automation ? flattenSteps(automation.steps).find((s) => s.id === sid.data) : null;
    if (!step || step.type !== "send_email") return { ok: false, error: "This email step wasn't found. Save your changes and try again." };

    const sender = await getVerifiedSender(ws.id, typeof v.senderId === "string" && v.senderId ? v.senderId : (step.senderId ?? ""));
    if (!sender) return { ok: false, error: "Pick a verified sender. You can verify one in Settings → Senders." };
    const providerId = sender.providerId ?? (await getDefaultProvider(ws.id))?.id;
    if (!providerId) return { ok: false, error: "This sender has no email provider. Connect one in Settings → Providers." };

    if (!takeTestSendSlot(user.id)) {
      return { ok: false, error: `You've sent ${TEST_LIMIT.perHour} test emails in the last hour. Please try again later.` };
    }

    const rendered = await renderDocument(step.document, { subject: step.subject, preheader: step.preheader });
    // Workspace filter: a test can only be personalised as one of OUR contacts.
    const contact = await db.contact.findUnique({
      where: { workspaceId_email: { workspaceId: ws.id, email: to.data } },
      select: { email: true, firstName: true, lastName: true, attributes: true },
    });
    const data = buildMergeData(contact ?? SAMPLE_CONTACT, { unsubscribeUrl: "#unsubscribe-link-(test)", workspaceName: ws.name });
    let filled;
    try {
      filled = personalize({ html: rendered.html, text: rendered.text, subject: step.subject || step.name }, data);
    } catch (error) {
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
      tags: { kind: "automation-test" },
    });
    if (!result.ok) return { ok: false, error: `The email provider said: ${result.error}` };
    return { ok: true, to: to.data };
  } catch (error) {
    console.error("sendStepTestAction failed:", error);
    return { ok: false, error: "Couldn't send the test email. Please try again." };
  }
}
