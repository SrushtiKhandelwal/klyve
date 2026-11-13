// Ready-to-use new steps for the "+" menu, filled with sensible defaults so a
// freshly added step is valid straight away (the autosave never chokes on it).
import { newStepId, type AutomationStep } from "@/lib/automations/schema";
import { emptyDocument, type BrandTheme } from "@/lib/templates/document";
import type { Lookups } from "../describe";
import { emailStepsAbove, getContainer, type ContainerRef } from "./tree";

export type NewStepContext = {
  theme: BrandTheme;
  /** First verified sender, so new emails are ready to go. */
  defaultSenderId: string | null;
  lookups: Lookups;
};

export type NewStepType = AutomationStep["type"];

export const NEW_STEP_TYPES: NewStepType[] = [
  "send_email",
  "wait",
  "condition",
  "add_to_list",
  "remove_from_list",
  "update_field",
  "exit",
];

export const NEW_STEP_HINTS: Record<NewStepType, string> = {
  send_email: "An email from you",
  wait: "Pause for minutes, hours or days",
  condition: "Split into two paths",
  add_to_list: "Put them on a list",
  remove_from_list: "Take them off a list",
  update_field: "Change a contact field",
  exit: "Stop here for this path",
};

/**
 * The "send email" steps a NEW step inserted at (container, index) would have
 * passed. Same rule as emailStepsAbove, but for a place rather than a step.
 */
export function emailsBeforePlace(steps: AutomationStep[], ref: ContainerRef, index: number) {
  const list = getContainer(steps, ref) ?? [];
  const here = list.slice(0, index).reverse().filter((s) => s.type === "send_email");
  const outer = ref.conditionId ? emailStepsAbove(steps, ref.conditionId) : [];
  return [...here, ...outer];
}

/** Why this type can't be created from the current data, or null. */
export function newStepBlocker(type: NewStepType, ctx: NewStepContext, emailsAbove: number): string | null {
  const { lists, segments } = ctx.lookups;
  if ((type === "add_to_list" || type === "remove_from_list") && lists.length === 0) return "Create a list first";
  if (type === "condition" && emailsAbove === 0 && lists.length === 0 && segments.length === 0) {
    return "Add an email above, or create a list";
  }
  return null;
}

/** A new step of `type`. Returns null if it can't be made (see newStepBlocker). */
export function createStep(
  type: NewStepType,
  ctx: NewStepContext,
  emailsAbove: { id: string }[],
  emailCount: number,
): AutomationStep | null {
  const id = newStepId();
  const firstList = ctx.lookups.lists[0]?.id;
  switch (type) {
    case "send_email":
      return {
        id,
        type,
        name: emailCount === 0 ? "Welcome email" : `Email ${emailCount + 1}`,
        subject: "",
        preheader: "",
        senderId: ctx.defaultSenderId,
        document: emptyDocument(ctx.theme),
      };
    case "wait":
      return { id, type, amount: 1, unit: "days" };
    case "condition": {
      // Most common question: "did they open the email just above?"
      const condition = emailsAbove[0]
        ? { kind: "email_activity" as const, stepId: emailsAbove[0].id, action: "opened" as const }
        : firstList
          ? { kind: "in_list" as const, listId: firstList }
          : ctx.lookups.segments[0]
            ? { kind: "in_segment" as const, segmentId: ctx.lookups.segments[0].id }
            : null;
      return condition ? { id, type, condition, yes: [], no: [] } : null;
    }
    case "add_to_list":
    case "remove_from_list":
      return firstList ? { id, type, listId: firstList } : null;
    case "update_field":
      return { id, type, target: "FIRSTNAME", value: "" };
    case "exit":
      return { id, type };
  }
}
