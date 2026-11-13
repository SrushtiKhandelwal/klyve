import "server-only";
import { isDeepStrictEqual } from "node:util";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import {
  activationProblems,
  flattenSteps,
  stepsSchema,
  triggerSchema,
  type AutomationStep,
  type AutomationTrigger,
  type SendEmailStep,
} from "@/lib/automations/schema";
import { renderStepEmail, syncAutomationCampaigns, type StepEmailContent } from "@/lib/automations/emails";
import { enrollFromSource, MANUAL_ENROLL_MAX, type OccurrenceMode } from "@/lib/automations/triggers";
import { parseAttributeValue } from "@/lib/contacts/common";
import { loadRulesContext, validateRulesForWorkspace } from "@/lib/segments/engine";

// Turning automations on and off, editing them, adding people by hand.
// Called by the builder screens (Server Actions); every function takes the
// workspace FIRST and only touches that workspace's rows.
//
// THE STATE MACHINE
//   DRAFT ──activate──▶ ACTIVE ──pause──▶ PAUSED ──activate──▶ ACTIVE
//   Editing (saveAutomationDraft) is allowed in DRAFT and PAUSED only.
//   Every change is ONE conditional write ("... WHERE status = 'PAUSED'"),
//   so two clicks (or a click and the worker) can never both win.
//
// THE TRIGGER CURSOR (where trigger scanning continues, see triggers.ts)
//   • First activation: the cursor starts at NOW, so people who joined the
//     list (etc.) in the past are NOT enrolled.
//   • Re-activation after a pause: we continue from the old cursor, so people
//     who joined DURING the pause still enter, but we catch up on at most the
//     last 7 days (a 6-month-old pause shouldn't suddenly email everyone).
//   • Changing the trigger while paused resets the cursor: the next
//     activation starts fresh at "now" (catching up on another list's past
//     would surprise people).
//   • Birthdays don't use a time cursor: the cursor is "today's scan is done".
//     Days missed while paused are not caught up (a late birthday email is
//     worse than none).

type WorkspaceArg = string | { id: string };
const wsId = (ws: WorkspaceArg) => (typeof ws === "string" ? ws : ws.id);
const cleanId = (v: unknown) => (typeof v === "string" && v.length > 0 && v.length <= 64 ? v : null);

const NOT_FOUND = "This automation doesn't exist (or was deleted).";
/** Re-activation catches up on at most this much of the pause. */
export const REACTIVATION_CATCH_UP_MS = 7 * 24 * 60 * 60_000;

export type ActivateResult = { ok: true } | { ok: false; problems: string[] };
export type StateResult = { ok: true } | { ok: false; error: string };

// ── Activate ────────────────────────────────────────────────────────────────

/**
 * DRAFT/PAUSED → ACTIVE, after every check passes. Prepares (or refreshes)
 * the hidden campaign of each "Send email" step in the same transaction, so
 * an active automation always has its emails ready.
 */
export async function activateAutomation(ws: WorkspaceArg, automationId: string, userId: string): Promise<ActivateResult> {
  const workspaceId = wsId(ws);
  const id = cleanId(automationId);
  const automation = id
    ? await db.automation.findFirst({
        where: { id, workspaceId },
        select: { id: true, name: true, status: true, trigger: true, steps: true, triggerCursor: true, updatedAt: true },
      })
    : null;
  if (!automation) return { ok: false, problems: [NOT_FOUND] };
  if (automation.status === "ACTIVE") return { ok: true }; // already on: nothing to do

  const trigger = triggerSchema.safeParse(automation.trigger);
  const steps = stepsSchema.safeParse(automation.steps);
  if (!trigger.success) return { ok: false, problems: ["Choose what starts this automation (the trigger)."] };
  if (!steps.success) {
    return { ok: false, problems: [...new Set(steps.error.issues.map((i) => i.message))].map((m) => `The steps have a problem: ${m}`) };
  }

  const problems = [...activationProblems(trigger.data, steps.data)];
  const user = await db.user.findUnique({ where: { id: userId }, select: { emailVerified: true } });
  if (!user?.emailVerified) problems.push("Verify your account email before turning on automations. We sent you a link when you signed up.");
  problems.push(...(await databaseProblems(workspaceId, trigger.data, steps.data)));

  // Render every email now (same checks as a campaign's pre-send checks).
  // Always, so the user sees ALL problems at once, not one round at a time.
  const emails: { step: SendEmailStep; content: StepEmailContent }[] = [];
  for (const step of flattenSteps(steps.data)) {
    if (step.type !== "send_email") continue;
    const rendered = await renderStepEmail(workspaceId, step, { automationName: automation.name });
    if (rendered.ok) emails.push({ step, content: rendered.content });
    else problems.push(...rendered.problems);
  }
  if (problems.length > 0) return { ok: false, problems: [...new Set(problems)] };

  const now = new Date();
  let triggerCursor: Date | null;
  if (trigger.data.type === "date_anniversary") {
    triggerCursor = automation.triggerCursor; // null = today's birthday scan not done yet
  } else if (automation.status === "DRAFT" || !automation.triggerCursor) {
    triggerCursor = now;
  } else {
    triggerCursor = new Date(Math.max(automation.triggerCursor.getTime(), now.getTime() - REACTIVATION_CATCH_UP_MS));
  }

  const CHANGED = "changed";
  try {
    await db.$transaction(
      async (tx) => {
        // Only the exact version we checked may go live: if it was edited
        // meanwhile, `updatedAt` differs and nothing happens.
        const flipped = await tx.automation.updateMany({
          where: { id: automation.id, workspaceId, status: { in: ["DRAFT", "PAUSED"] }, updatedAt: automation.updatedAt },
          data: { status: "ACTIVE", activatedAt: now, triggerCursor },
        });
        if (flipped.count !== 1) throw new Error(CHANGED);
        await syncAutomationCampaigns(
          tx,
          { id: automation.id, workspaceId, name: automation.name, trigger: trigger.data },
          emails,
          { now, userId },
        );
      },
      { timeout: 30_000, maxWait: 10_000 },
    );
  } catch (error) {
    if (error instanceof Error && error.message === CHANGED) {
      return { ok: false, problems: ["The automation was changed while it was being checked. Please try again."] };
    }
    throw error;
  }
  return { ok: true };
}

/**
 * Checks that everything the automation points at exists IN THIS WORKSPACE
 * (lists, forms, segments, fields), and that field values fit their type.
 * Senders/providers are checked while rendering the emails.
 */
async function databaseProblems(workspaceId: string, trigger: AutomationTrigger, steps: AutomationStep[]): Promise<string[]> {
  const problems: string[] = [];
  const all = flattenSteps(steps);

  const listIds = new Set<string>();
  const segmentIds = new Set<string>();
  const attributeKeys = new Set<string>();
  if (trigger.type === "list_joined") listIds.add(trigger.listId);
  if (trigger.type === "date_anniversary") attributeKeys.add(trigger.attributeKey);
  for (const s of all) {
    if (s.type === "add_to_list" || s.type === "remove_from_list") listIds.add(s.listId);
    if (s.type === "condition" && s.condition.kind === "in_list") listIds.add(s.condition.listId);
    if (s.type === "condition" && s.condition.kind === "in_segment") segmentIds.add(s.condition.segmentId);
    if (s.type === "update_field" && s.target.startsWith("attr:")) attributeKeys.add(s.target.slice(5));
  }

  const [lists, form, segments, attributes] = await Promise.all([
    listIds.size ? db.contactList.findMany({ where: { workspaceId, id: { in: [...listIds] } }, select: { id: true } }) : [],
    trigger.type === "form_submitted"
      ? db.signupForm.findFirst({ where: { id: trigger.formId, workspaceId }, select: { id: true } })
      : null,
    segmentIds.size ? db.segment.findMany({ where: { workspaceId, id: { in: [...segmentIds] } }, select: { id: true, name: true, rules: true } }) : [],
    attributeKeys.size
      ? db.contactAttribute.findMany({ where: { workspaceId, key: { in: [...attributeKeys] } }, select: { key: true, label: true, type: true } })
      : [],
  ]);
  const foundLists = new Set(lists.map((l) => l.id));
  const attributeByKey = new Map(attributes.map((a) => [a.key, a]));

  // Trigger
  if (trigger.type === "list_joined" && !foundLists.has(trigger.listId)) problems.push("The list that starts this automation was deleted. Pick another list.");
  if (trigger.type === "form_submitted" && !form) problems.push("The sign-up form that starts this automation was deleted. Pick another form.");
  if (trigger.type === "date_anniversary") {
    const attr = attributeByKey.get(trigger.attributeKey);
    if (!attr) problems.push(`The date field ${trigger.attributeKey} doesn't exist any more. Pick another field.`);
    else if (attr.type !== "DATE") problems.push(`The field “${attr.label}” isn't a date field. Pick a date field (like a birthday).`);
  }

  // Steps
  for (const s of all) {
    if ((s.type === "add_to_list" || s.type === "remove_from_list") && !foundLists.has(s.listId)) {
      problems.push(`A “${s.type === "add_to_list" ? "Add to list" : "Remove from list"}” step uses a list that was deleted.`);
    }
    if (s.type === "condition" && s.condition.kind === "in_list" && !foundLists.has(s.condition.listId)) {
      problems.push("An if/else step checks a list that was deleted.");
    }
    if (s.type === "update_field" && s.target.startsWith("attr:")) {
      const key = s.target.slice(5);
      const attr = attributeByKey.get(key);
      if (!attr) {
        problems.push(`An “Update field” step uses the field ${key}, which doesn't exist any more.`);
      } else {
        const parsed = parseAttributeValue(attr.type, s.value);
        if (!parsed.ok) problems.push(`An “Update field” step sets “${attr.label}”: ${parsed.error}`);
      }
    }
  }
  if (segmentIds.size) {
    const context = await loadRulesContext(workspaceId);
    for (const segmentId of segmentIds) {
      const segment = segments.find((x) => x.id === segmentId);
      if (!segment) {
        problems.push("An if/else step checks a segment that was deleted.");
        continue;
      }
      const checked = await validateRulesForWorkspace(workspaceId, segment.rules, context);
      if (!checked.ok) problems.push(`The segment “${segment.name}” has a problem: ${checked.errors[0] ?? "its rules aren't valid"}. Fix it on the Segments page.`);
    }
  }
  return problems;
}

// ── Pause ───────────────────────────────────────────────────────────────────

/**
 * ACTIVE → PAUSED. Nobody new enters and people inside stop where they are
 * (the engine re-checks before every step). Emails ALREADY queued still go
 * out: they were due before the pause.
 */
export async function pauseAutomation(ws: WorkspaceArg, automationId: string): Promise<StateResult> {
  const workspaceId = wsId(ws);
  const id = cleanId(automationId);
  if (!id) return { ok: false, error: NOT_FOUND };
  const r = await db.automation.updateMany({ where: { id, workspaceId, status: "ACTIVE" }, data: { status: "PAUSED" } });
  if (r.count === 1) return { ok: true };
  const row = await db.automation.findFirst({ where: { id, workspaceId }, select: { status: true } });
  if (!row) return { ok: false, error: NOT_FOUND };
  return { ok: false, error: `This automation can't be paused right now (it is ${row.status.toLowerCase()}).` };
}

// ── Save (edit) ─────────────────────────────────────────────────────────────

export type DraftPatch = { name?: unknown; trigger?: unknown; steps?: unknown; allowReentry?: unknown };
export type SaveResult = { ok: true; exitedRuns: number } | { ok: false; error: string };

const noControlChars = (v: string) => ![...v].some((ch) => ch.charCodeAt(0) < 0x20 || ch.charCodeAt(0) === 0x7f);

/**
 * Saves edits while DRAFT or PAUSED (an ACTIVE automation must be paused
 * first). People waiting on a step that was REMOVED leave the automation
 * (EXITED, "step removed"). The hidden emails are refreshed at the next
 * activation, which re-checks everything.
 */
export async function saveAutomationDraft(ws: WorkspaceArg, automationId: string, patch: DraftPatch): Promise<SaveResult> {
  const workspaceId = wsId(ws);
  const id = cleanId(automationId);
  const current = id
    ? await db.automation.findFirst({ where: { id, workspaceId }, select: { id: true, status: true, trigger: true } })
    : null;
  if (!current) return { ok: false, error: NOT_FOUND };
  if (current.status === "ACTIVE") return { ok: false, error: "Pause the automation before editing it." };

  const data: Prisma.AutomationUpdateManyMutationInput = {};
  if (patch.name !== undefined) {
    const name = typeof patch.name === "string" ? patch.name.trim() : "";
    if (!name) return { ok: false, error: "Give the automation a name." };
    if (name.length > 100) return { ok: false, error: "Keep the name under 100 characters." };
    if (!noControlChars(name)) return { ok: false, error: "The name can't contain line breaks." };
    data.name = name;
  }
  if (patch.trigger !== undefined) {
    const trigger = triggerSchema.safeParse(patch.trigger);
    if (!trigger.success) return { ok: false, error: "The trigger isn't valid. Please choose it again." };
    data.trigger = trigger.data as Prisma.InputJsonValue;
    // A different trigger starts fresh at the next activation (see the top of this file).
    if (!isDeepStrictEqual(trigger.data, current.trigger)) data.triggerCursor = null;
  }
  let stepIds: string[] | null = null;
  if (patch.steps !== undefined) {
    const steps = stepsSchema.safeParse(patch.steps);
    if (!steps.success) return { ok: false, error: steps.error.issues[0]?.message ?? "The steps aren't valid." };
    data.steps = steps.data as unknown as Prisma.InputJsonValue;
    stepIds = flattenSteps(steps.data).map((s) => s.id);
  }
  if (patch.allowReentry !== undefined) {
    if (typeof patch.allowReentry !== "boolean") return { ok: false, error: "Re-entry must be on or off." };
    data.allowReentry = patch.allowReentry;
  }
  if (Object.keys(data).length === 0) return { ok: true, exitedRuns: 0 };

  const now = new Date();
  return db.$transaction(async (tx) => {
    // The status is part of the WHERE: an automation activated a split second ago is never edited.
    const saved = await tx.automation.updateMany({ where: { id: current.id, workspaceId, status: { in: ["DRAFT", "PAUSED"] } }, data });
    if (saved.count !== 1) return { ok: false as const, error: "This automation was turned on meanwhile. Pause it before editing." };
    if (!stepIds) return { ok: true as const, exitedRuns: 0 };

    // People on a step that no longer exists leave, with a note in their history.
    const reason = "The step this person was on was removed from the automation.";
    const rows = await tx.$queryRaw<{ n: number }[]>(Prisma.sql`
      WITH gone AS (
        UPDATE automation_run
        SET status = 'EXITED'::"AutomationRunStatus", "finishedAt" = ${now}::timestamp, "lockedAt" = NULL, "lastError" = ${reason}
        WHERE "automationId" = ${current.id} AND status IN ('ACTIVE', 'WAITING')
          AND "currentStepId" IS NOT NULL AND NOT ("currentStepId" = ANY(${stepIds}::text[]))
        RETURNING id, "currentStepId"
      ), logs AS (
        INSERT INTO automation_log (id, "runId", "stepId", action, detail, "createdAt")
        SELECT 'al' || replace(gen_random_uuid()::text, '-', ''), gone.id, gone."currentStepId", 'exited',
               '{"reason":"step_removed"}'::jsonb, ${now}::timestamp
        FROM gone
      )
      SELECT count(*)::int AS n FROM gone`);
    return { ok: true as const, exitedRuns: rows[0]?.n ?? 0 };
  });
}

// ── Manual enrolment ────────────────────────────────────────────────────────

export type EnrollResult = { enrolled: number; skipped: number; error?: string };

/**
 * Adds people by hand (from a contact's page or a segment). Only into an
 * ACTIVE automation, only SUBSCRIBED + not suppressed contacts of this
 * workspace, and the usual "who may enter again" rules apply. Up to 5000
 * people per call. `skipped` = asked for but not added (not subscribed,
 * suppressed, already in it, another workspace's id…).
 */
export async function enrollContacts(
  ws: WorkspaceArg,
  automationId: string,
  contactIds: string[],
  options: { source: "manual" } = { source: "manual" },
): Promise<EnrollResult> {
  const workspaceId = wsId(ws);
  const ids = [...new Set((Array.isArray(contactIds) ? contactIds : []).filter((v) => cleanId(v)))];
  if (ids.length === 0) return { enrolled: 0, skipped: 0 };
  if (ids.length > MANUAL_ENROLL_MAX) {
    return { enrolled: 0, skipped: ids.length, error: `You can add at most ${MANUAL_ENROLL_MAX.toLocaleString("en-US")} people at once.` };
  }

  const id = cleanId(automationId);
  const automation = id
    ? await db.automation.findFirst({ where: { id, workspaceId }, select: { id: true, status: true, trigger: true, steps: true, allowReentry: true } })
    : null;
  if (!automation) return { enrolled: 0, skipped: ids.length, error: NOT_FOUND };
  if (automation.status !== "ACTIVE") return { enrolled: 0, skipped: ids.length, error: "Turn the automation on before adding people to it." };
  const trigger = triggerSchema.safeParse(automation.trigger);
  const steps = stepsSchema.safeParse(automation.steps);
  if (!trigger.success || !steps.success || steps.data.length === 0) {
    return { enrolled: 0, skipped: ids.length, error: "This automation has no steps yet." };
  }

  const now = new Date();
  // Birthdays: one run per person per year (this year). Otherwise the
  // re-entry switch decides; a manual add has no cooldown, but someone who is
  // still inside isn't added twice.
  const mode: OccurrenceMode =
    trigger.data.type === "date_anniversary"
      ? { kind: "year", year: String(now.getUTCFullYear()) }
      : automation.allowReentry
        ? { kind: "reentry", cooldownMs: 0 }
        : { kind: "once" };

  const source = Prisma.sql`
    SELECT u.id AS contact_id, ${now}::timestamp AS at, ${`manual:${now.getTime()}`}::text AS occ
    FROM unnest(${ids}::text[]) AS u(id)`;
  const r = await enrollFromSource({ id: automation.id, workspaceId, firstStepId: steps.data[0].id }, source, mode, {
    now,
    limit: ids.length,
    detail: { source: options.source },
  });
  return { enrolled: r.enrolled, skipped: ids.length - r.enrolled };
}

// ── Delete ──────────────────────────────────────────────────────────────────

/**
 * Deletes the automation, its runs and history, and its hidden email
 * campaigns (with their recipient rows): the database cascades all of it.
 */
export async function deleteAutomation(ws: WorkspaceArg, automationId: string): Promise<StateResult> {
  const workspaceId = wsId(ws);
  const id = cleanId(automationId);
  if (!id) return { ok: false, error: NOT_FOUND };
  const r = await db.automation.deleteMany({ where: { id, workspaceId } });
  return r.count === 1 ? { ok: true } : { ok: false, error: NOT_FOUND };
}
