import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import {
  nextStepId,
  waitMs,
  type AutomationCondition,
  type AutomationStep,
  type AutomationTrigger,
  type ConditionStep,
  type ListStep,
  type SendEmailStep,
  type UpdateFieldStep,
} from "@/lib/automations/schema";
import { ensureStepCampaign, findStepRecipient, queueStepEmail, stepCampaignKey } from "@/lib/automations/emails";
import { parseAttributeValue } from "@/lib/contacts/common";
import { MAX_CONDITIONS, type SegmentCondition } from "@/lib/segments/rules";
import { countSegment, loadRulesContext, validateRulesForWorkspace } from "@/lib/segments/engine";

// What each kind of step DOES for one person. The engine (engine.ts) decides
// which step runs and saves the progress; these functions do the work and
// say where to go next.
//
// Every step is safe to run twice (after a crash the engine may repeat the
// step it was on): an email is queued at most once (unique row), adding to a
// list that you're already on changes nothing, setting a field to the same
// value changes nothing, and conditions only read.

/** Everything a step needs to know about the automation and the person. */
export type StepContext = {
  now: Date;
  automation: {
    id: string;
    workspaceId: string;
    name: string;
    trigger: AutomationTrigger;
    steps: AutomationStep[];
    createdById: string | null;
  };
  run: { id: string; occurrence: string | null };
  contact: { id: string; email: string };
};

export type LogEntry = { action: string; detail?: Record<string, unknown> };

export type StepOutcome =
  /** Done; continue with `next` (null = the end of the automation). */
  | { kind: "next"; next: string | null; log: LogEntry }
  /** Stay on this step until `until` (a wait, or waiting for an email to go out). */
  | { kind: "wait"; until: Date; log: LogEntry | null }
  /** Leave the automation now. `reason` is shown in the run's history. */
  | { kind: "exit"; reason: string; log: LogEntry }
  /** Something is wrong with the step itself: the run stops as FAILED. */
  | { kind: "fail"; error: string };

/**
 * If an "opened/clicked?" condition runs before the email it checks was even
 * sent (sending is asynchronous), we look again every 5 minutes for up to an
 * hour after the email was queued, then decide with what we know ("no").
 * Normally people put a wait (e.g. 2 days) before such a condition anyway.
 */
export const EMAIL_PENDING_MAX_WAIT_MS = 60 * 60_000;
const EMAIL_PENDING_RECHECK_MS = 5 * 60_000;

/**
 * Runs one step. `waking` = the run was WAITING on this very step and its
 * time has come (for a wait step: the wait is over).
 */
export async function executeStep(ctx: StepContext, step: AutomationStep, opts: { waking: boolean }): Promise<StepOutcome> {
  switch (step.type) {
    case "send_email":
      return sendEmail(ctx, step);
    case "wait":
      if (opts.waking) return { kind: "next", next: after(ctx, step), log: { action: "waited" } };
      return {
        kind: "wait",
        until: new Date(ctx.now.getTime() + waitMs(step)),
        log: { action: "waiting", detail: { amount: step.amount, unit: step.unit } },
      };
    case "condition":
      return condition(ctx, step, opts.waking);
    case "add_to_list":
    case "remove_from_list":
      return listChange(ctx, step);
    case "update_field":
      return updateField(ctx, step);
    case "exit":
      return { kind: "exit", reason: "Reached an exit step.", log: { action: "exited", detail: { reason: "exit_step" } } };
  }
}

/** The step after this one (climbing out of if/else branches). */
function after(ctx: StepContext, step: AutomationStep): string | null {
  return nextStepId(ctx.automation.steps, step.id);
}

// ── Send email ───────────────────────────────────────────────────────────────

async function sendEmail(ctx: StepContext, step: SendEmailStep): Promise<StepOutcome> {
  const key = stepCampaignKey(ctx.automation.trigger, step.id, ctx.run.occurrence);
  const campaign = await ensureStepCampaign(ctx.automation, step, key, ctx.now);
  if (!campaign.ok) return { kind: "fail", error: campaign.error };
  // PAUSED (provider broken, sending health…) still queues: it goes out on resume.
  if (campaign.status !== "SENDING" && campaign.status !== "PAUSED") {
    return { kind: "fail", error: `The email “${step.name}” was stopped (${campaign.status.toLowerCase()}). Pause and re-activate the automation to restart it.` };
  }

  const result = await queueStepEmail(ctx.automation.workspaceId, campaign.campaignId, ctx.contact.id);
  if (result === "queued") {
    return { kind: "next", next: after(ctx, step), log: { action: "email_queued", detail: { campaignId: campaign.campaignId } } };
  }
  if (result === "already") {
    // Re-entry (or a retried step): this person already got this exact email.
    // One email per person per step is the rule, so we skip it and go on.
    return { kind: "next", next: after(ctx, step), log: { action: "email_already_sent", detail: { campaignId: campaign.campaignId } } };
  }
  // The INSERT re-checks "subscribed and not suppressed" at the last moment.
  return {
    kind: "exit",
    reason: "The contact is no longer subscribed (or is on the suppression list).",
    log: { action: "exited", detail: { reason: "not_subscribed" } },
  };
}

// ── If / else ────────────────────────────────────────────────────────────────

async function condition(ctx: StepContext, step: ConditionStep, waking: boolean): Promise<StepOutcome> {
  const answer = await evaluate(ctx, step.condition);
  if (answer.kind === "pending") {
    // Log only when we START waiting, not at every re-check.
    return { kind: "wait", until: answer.until, log: waking ? null : { action: "condition_waiting", detail: { reason: "email_not_sent_yet" } } };
  }
  const branch = answer.yes ? step.yes : step.no;
  const next = branch[0]?.id ?? after(ctx, step);
  return {
    kind: "next",
    next,
    log: { action: answer.yes ? "branch_yes" : "branch_no", detail: { condition: step.condition.kind, ...(answer.note ? { note: answer.note } : {}) } },
  };
}

type Answer = { kind: "decided"; yes: boolean; note?: string } | { kind: "pending"; until: Date };

async function evaluate(ctx: StepContext, cond: AutomationCondition): Promise<Answer> {
  const { workspaceId } = ctx.automation;
  switch (cond.kind) {
    case "email_activity": {
      const key = stepCampaignKey(ctx.automation.trigger, cond.stepId, ctx.run.occurrence);
      const rec = await findStepRecipient(ctx.automation.id, workspaceId, key, ctx.contact.id);
      if (!rec) return { kind: "decided", yes: false, note: "email_not_sent" };
      if (rec.status === "PENDING" || rec.status === "SENDING") {
        const deadline = rec.createdAt.getTime() + EMAIL_PENDING_MAX_WAIT_MS;
        if (ctx.now.getTime() < deadline) {
          return { kind: "pending", until: new Date(Math.min(deadline, ctx.now.getTime() + EMAIL_PENDING_RECHECK_MS)) };
        }
      }
      const yes = cond.action === "opened" ? rec.firstOpenedAt !== null : rec.firstClickedAt !== null;
      return { kind: "decided", yes };
    }
    case "in_list": {
      // The list must belong to this workspace; a deleted list = "no".
      const member = await db.listMembership.findFirst({
        where: { listId: cond.listId, contactId: ctx.contact.id, list: { workspaceId } },
        select: { listId: true },
      });
      return { kind: "decided", yes: member !== null };
    }
    case "in_segment": {
      const segment = await db.segment.findFirst({ where: { id: cond.segmentId, workspaceId }, select: { rules: true } });
      if (!segment) return { kind: "decided", yes: false, note: "segment_missing" };
      const match = await contactMatchesSegment(workspaceId, segment.rules, ctx.contact.email);
      if (match === null) return { kind: "decided", yes: false, note: "segment_invalid" };
      return { kind: "decided", yes: match };
    }
  }
}

/**
 * Does ONE contact match a saved segment right now? Uses the segment engine
 * itself (so the meaning is exactly the same as on the Segments page), with
 * an extra "email equals <this contact>" condition to narrow it to them.
 *  - match "all": all conditions + the email condition (split in groups if
 *    that would exceed the 25-condition limit; every group must match)
 *  - match "any": each condition + the email condition, until one matches
 * Returns null when the segment's rules are no longer valid (e.g. a field
 * it uses was deleted).
 */
export async function contactMatchesSegment(workspaceId: string, rules: unknown, email: string): Promise<boolean | null> {
  const context = await loadRulesContext(workspaceId);
  const checked = await validateRulesForWorkspace(workspaceId, rules, context);
  if (!checked.ok) return null;
  const conditions = checked.rules.conditions;
  if (conditions.length === 0) return true; // no conditions = everyone in the workspace

  const thisContact = { field: "email", operator: "equals", value: email } as SegmentCondition;
  const matches = async (group: SegmentCondition[]): Promise<boolean> => {
    const narrowed = await validateRulesForWorkspace(workspaceId, { match: "all", conditions: [...group, thisContact] }, context);
    if (!narrowed.ok) return false;
    return (await countSegment(workspaceId, narrowed.checked)) > 0;
  };

  if (checked.rules.match === "any") {
    for (const c of conditions) if (await matches([c])) return true;
    return false;
  }
  const size = MAX_CONDITIONS - 1;
  for (let i = 0; i < conditions.length; i += size) {
    if (!(await matches(conditions.slice(i, i + size)))) return false;
  }
  return true;
}

// ── Lists ────────────────────────────────────────────────────────────────────

async function listChange(ctx: StepContext, step: ListStep): Promise<StepOutcome> {
  const next = after(ctx, step);
  // Only a list of THIS workspace. A deleted list is noted and skipped, so
  // one missing list doesn't stop the rest of a welcome series.
  const list = await db.contactList.findFirst({ where: { id: step.listId, workspaceId: ctx.automation.workspaceId }, select: { id: true } });
  if (!list) return { kind: "next", next, log: { action: "list_missing", detail: { listId: step.listId } } };

  if (step.type === "add_to_list") {
    await db.listMembership.createMany({ data: [{ listId: list.id, contactId: ctx.contact.id }], skipDuplicates: true });
    return { kind: "next", next, log: { action: "list_added", detail: { listId: list.id } } };
  }
  await db.listMembership.deleteMany({ where: { listId: list.id, contactId: ctx.contact.id } });
  return { kind: "next", next, log: { action: "list_removed", detail: { listId: list.id } } };
}

// ── Update a field ───────────────────────────────────────────────────────────

const NAME_MAX = 100; // same limit as the contact form

async function updateField(ctx: StepContext, step: UpdateFieldStep): Promise<StepOutcome> {
  const next = after(ctx, step);
  const { workspaceId } = ctx.automation;

  if (step.target === "FIRSTNAME" || step.target === "LASTNAME") {
    const parsed = parseAttributeValue("TEXT", step.value);
    const value = parsed.ok && typeof parsed.value === "string" ? parsed.value.replace(/\s+/g, " ").slice(0, NAME_MAX) : null;
    await db.contact.updateMany({
      where: { id: ctx.contact.id, workspaceId },
      data: step.target === "FIRSTNAME" ? { firstName: value } : { lastName: value },
    });
    return { kind: "next", next, log: { action: "field_updated", detail: { field: step.target } } };
  }

  const key = step.target.slice("attr:".length);
  const attribute = await db.contactAttribute.findFirst({ where: { workspaceId, key }, select: { type: true } });
  if (!attribute) return { kind: "next", next, log: { action: "field_missing", detail: { field: key } } };
  const parsed = parseAttributeValue(attribute.type, step.value);
  if (!parsed.ok) return { kind: "next", next, log: { action: "field_invalid", detail: { field: key, error: parsed.error } } };

  // One statement, changing only this key: a field edited at the same moment
  // by someone else is not overwritten. An empty value clears the field.
  await db.$executeRaw(Prisma.sql`
    UPDATE contact
    SET attributes = CASE
          WHEN ${parsed.value === null} THEN attributes - ${key}::text
          ELSE attributes || jsonb_build_object(${key}::text, ${JSON.stringify(parsed.value)}::jsonb)
        END,
        "updatedAt" = ${new Date()}::timestamp
    WHERE id = ${ctx.contact.id} AND "workspaceId" = ${workspaceId}`);
  return { kind: "next", next, log: { action: "field_updated", detail: { field: key } } };
}
