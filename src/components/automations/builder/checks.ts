// What the builder checks while you edit:
//  1. saveIssue()   → the first reason the workflow can't even be SAVED
//                     (shown as "Not saved yet: …"; nothing is sent until fixed).
//  2. readinessProblems() → everything that blocks ACTIVATING, shown as a live
//                     checklist. The server re-checks all of it on "Activate".
import {
  activationProblems,
  flattenSteps,
  stepsSchema,
  triggerSchema,
  type AutomationStep,
  type AutomationTrigger,
} from "@/lib/automations/schema";
import { NOT_CHOSEN_ID, type Lookups } from "../describe";
import { emailStepsAbove, structureProblems } from "./tree";

/** A friendly message for one step that the schema would refuse, or null. */
export function stepIssue(step: AutomationStep): string | null {
  switch (step.type) {
    case "send_email":
      if (!step.name.trim()) return "Give each email a name (only you see it).";
      if (step.name.trim().length > 100) return "Keep email names under 100 characters.";
      if (step.subject.trim().length > 200) return `“${step.name}”: keep the subject under 200 characters.`;
      if (step.preheader.trim().length > 200) return `“${step.name}”: keep the preview text under 200 characters.`;
      return null;
    case "wait":
      if (!Number.isInteger(step.amount) || step.amount < 1 || step.amount > 365) return "A wait must be a whole number from 1 to 365.";
      return null;
    case "update_field":
      if (step.value.length > 500) return "Keep field values under 500 characters.";
      return null;
    default:
      return null;
  }
}

/** Ids of steps that need attention before activating (an amber dot on their card). */
export function flaggedStepIds(steps: AutomationStep[], lookups: Lookups, senderIds: string[]): Set<string> {
  const flagged = new Set<string>();
  const hasList = (id: string) => lookups.lists.some((l) => l.id === id);
  for (const s of flattenSteps(steps)) {
    let bad = stepIssue(s) !== null;
    if (s.type === "send_email") {
      bad ||= !s.senderId || !senderIds.includes(s.senderId) || !s.subject.trim();
      bad ||= !/\{\{\s*unsubscribe_url\s*\}\}/.test(JSON.stringify(s.document));
    }
    if (s.type === "add_to_list" || s.type === "remove_from_list") bad ||= !hasList(s.listId);
    if (s.type === "condition") {
      const c = s.condition;
      if (c.kind === "email_activity") bad ||= !emailStepsAbove(steps, s.id).some((e) => e.id === c.stepId);
      if (c.kind === "in_list") bad ||= !hasList(c.listId);
      if (c.kind === "in_segment") bad ||= !lookups.segments.some((g) => g.id === c.segmentId);
    }
    if (s.type === "update_field" && s.target.startsWith("attr:")) {
      bad ||= !lookups.attributes.some((a) => `attr:${a.key}` === s.target);
    }
    if (bad) flagged.add(s.id);
  }
  return flagged;
}

/**
 * Biggest workflow (as JSON) we store. The builder sends the whole workflow,
 * email designs included, in one request, and Server Action requests are
 * capped at 2 MB (next.config.ts), so we stay safely under that. A normal
 * email design is 5–60 KB, so this fits dozens of emails.
 */
export const MAX_WORKFLOW_BYTES = 1_900_000;

const TOO_BIG = "This automation is too big to save. Remove some steps or make the email designs smaller.";

/** Why this trigger + steps can't be saved yet, or null when they can. */
export function saveIssue(trigger: AutomationTrigger, steps: AutomationStep[]): string | null {
  if (!triggerSchema.safeParse(trigger).success) return "Finish setting up the trigger.";
  // Characters ≈ bytes for designs (mostly ASCII); the server checks real bytes.
  if (JSON.stringify(steps).length > MAX_WORKFLOW_BYTES) return TOO_BIG;
  for (const s of flattenSteps(steps)) {
    const issue = stepIssue(s);
    if (issue) return issue;
  }
  const parsed = stepsSchema.safeParse(steps);
  if (!parsed.success) return parsed.error.issues[0]?.message ?? "A step isn't valid.";
  return null;
}

/**
 * Everything blocking activation: the shared rules (activationProblems), the
 * tree's shape (structureProblems), and names that no longer exist in this
 * workspace (a deleted list, an unverified sender…).
 */
export function readinessProblems(
  trigger: AutomationTrigger,
  steps: AutomationStep[],
  lookups: Lookups,
  senderIds: string[],
): string[] {
  const problems = [...activationProblems(trigger, steps), ...structureProblems(steps)];
  const hasList = (id: string) => lookups.lists.some((l) => l.id === id);

  // NOT_CHOSEN_ID = a ready-made recipe left it for the user to pick.
  if (trigger.type === "list_joined" && !hasList(trigger.listId)) {
    problems.push(trigger.listId === NOT_CHOSEN_ID ? "Choose the list that starts the automation (click the trigger)." : "The trigger's list was deleted: pick another one.");
  }
  if (trigger.type === "form_submitted" && !lookups.forms.some((f) => f.id === trigger.formId)) {
    problems.push(trigger.formId === NOT_CHOSEN_ID ? "Choose the form that starts the automation (click the trigger)." : "The trigger's form was deleted: pick another one.");
  }
  if (trigger.type === "date_anniversary" && !lookups.attributes.some((a) => a.key === trigger.attributeKey && a.type === "DATE")) {
    problems.push("The trigger needs a date field (like Birthday). Add one to your contacts' custom fields, then pick it.");
  }

  for (const s of flattenSteps(steps)) {
    if (s.type === "send_email" && s.senderId && !senderIds.includes(s.senderId)) {
      problems.push(`“${s.name}”: its sender isn't verified any more. Choose another one.`);
    }
    if ((s.type === "add_to_list" || s.type === "remove_from_list") && !hasList(s.listId)) {
      problems.push(s.listId === NOT_CHOSEN_ID ? "Choose the list for each “Add to list” / “Remove from list” step." : "A list step uses a list that was deleted.");
    }
    if (s.type === "condition") {
      if (s.condition.kind === "in_list" && !hasList(s.condition.listId)) problems.push("An if/else step uses a list that was deleted.");
      const segmentId = s.condition.kind === "in_segment" ? s.condition.segmentId : null;
      if (segmentId && !lookups.segments.some((g) => g.id === segmentId)) {
        problems.push("An if/else step uses a segment that was deleted.");
      }
    }
    if (s.type === "update_field" && s.target.startsWith("attr:")) {
      const key = s.target.slice(5);
      if (!lookups.attributes.some((a) => a.key === key)) problems.push("An “Update a field” step uses a field that was deleted.");
    }
  }
  return [...new Set(problems)];
}
