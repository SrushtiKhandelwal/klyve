// Plain-English sentences for triggers and steps ("When someone joins
// Newsletter", "Wait 2 days"). Pure functions, used by the list page (server)
// and the builder (browser). Names come from `Lookups`; anything we can't find
// (e.g. a deleted list) says so instead of showing a raw id.
import type { AutomationCondition, AutomationStep, AutomationTrigger, SendEmailStep, WaitStep } from "@/lib/automations/schema";

export type Lookups = {
  lists: { id: string; name: string }[];
  segments: { id: string; name: string }[];
  forms: { id: string; name: string }[];
  /** Custom fields: key (e.g. "CITY"), label, type ("TEXT" | "NUMBER" | "DATE" | "BOOLEAN"). */
  attributes: { key: string; label: string; type: string }[];
};

export const EMPTY_LOOKUPS: Lookups = { lists: [], segments: [], forms: [], attributes: [] };

/** A short piece of a sentence; `strong` parts are shown in bold. */
export type Part = { text: string; strong?: boolean; missing?: boolean };

/**
 * Ready-made recipes use this id for a list/form the user hasn't chosen yet
 * (RECIPE_PLACEHOLDER_ID in lib/automations/recipes; copied here so the
 * browser doesn't download every recipe's email designs just for one string).
 */
export const NOT_CHOSEN_ID = "choose_one";

const nameOf = (items: { id: string; name: string }[], id: string, what: string): Part => {
  if (id === NOT_CHOSEN_ID) return { text: `(choose a ${what})`, strong: true, missing: true };
  const found = items.find((i) => i.id === id);
  return found ? { text: found.name, strong: true } : { text: `a deleted ${what}`, strong: true, missing: true };
};

export function fieldLabel(target: string, lookups: Lookups): string {
  if (target === "FIRSTNAME") return "First name";
  if (target === "LASTNAME") return "Last name";
  const key = target.replace(/^attr:/, "");
  return lookups.attributes.find((a) => a.key === key)?.label ?? key;
}

const plural = (n: number, word: string) => `${n} ${n === 1 ? word : `${word}s`}`;

export function describeWait(step: Pick<WaitStep, "amount" | "unit">): string {
  return `Wait ${plural(step.amount, step.unit.replace(/s$/, ""))}`;
}

export function triggerParts(trigger: AutomationTrigger, lookups: Lookups): Part[] {
  switch (trigger.type) {
    case "list_joined":
      return [{ text: "When someone joins " }, nameOf(lookups.lists, trigger.listId, "list")];
    case "form_submitted":
      return [{ text: "When someone signs up through " }, nameOf(lookups.forms, trigger.formId, "form")];
    case "contact_created":
      return [{ text: "When a new subscriber is added" }];
    case "date_anniversary": {
      const attr = lookups.attributes.find((a) => a.key === trigger.attributeKey);
      const field: Part = attr ? { text: attr.label, strong: true } : { text: "a deleted field", strong: true, missing: true };
      return trigger.daysBefore > 0
        ? [{ text: `Every year, ${plural(trigger.daysBefore, "day")} before their ` }, field]
        : [{ text: "Every year on their " }, field];
    }
    case "manual":
      return [{ text: "When you add people by hand" }];
  }
}

export function conditionParts(condition: AutomationCondition, steps: AutomationStep[], lookups: Lookups): Part[] {
  switch (condition.kind) {
    case "email_activity": {
      const email = findEmail(steps, condition.stepId);
      return [
        { text: `If they ${condition.action} ` },
        email ? { text: email.name, strong: true } : { text: "a deleted email", strong: true, missing: true },
      ];
    }
    case "in_list":
      return [{ text: "If they're in " }, nameOf(lookups.lists, condition.listId, "list")];
    case "in_segment":
      return [{ text: "If they match " }, nameOf(lookups.segments, condition.segmentId, "segment")];
  }
}

function findEmail(steps: AutomationStep[], id: string): SendEmailStep | null {
  for (const s of steps) {
    if (s.id === id && s.type === "send_email") return s;
    if (s.type === "condition") {
      const inner = findEmail(s.yes, id) ?? findEmail(s.no, id);
      if (inner) return inner;
    }
  }
  return null;
}

const truncate = (v: string, max: number) => (v.length > max ? `${v.slice(0, max - 1)}…` : v);

/** The sentence on a step's card. `steps` is the whole tree (to name referenced emails). */
export function stepParts(step: AutomationStep, steps: AutomationStep[], lookups: Lookups): Part[] {
  switch (step.type) {
    case "send_email":
      return step.subject.trim()
        ? [{ text: "Send " }, { text: step.name, strong: true }, { text: ` · subject “${truncate(step.subject.trim(), 40)}”` }]
        : [{ text: "Send " }, { text: step.name, strong: true }, { text: " · no subject yet", missing: true }];
    case "wait":
      return [{ text: describeWait(step) }];
    case "condition":
      return conditionParts(step.condition, steps, lookups);
    case "add_to_list":
      return [{ text: "Add to list " }, nameOf(lookups.lists, step.listId, "list")];
    case "remove_from_list":
      return [{ text: "Remove from list " }, nameOf(lookups.lists, step.listId, "list")];
    case "update_field":
      return step.value === ""
        ? [{ text: "Clear " }, { text: fieldLabel(step.target, lookups), strong: true }]
        : [{ text: "Set " }, { text: fieldLabel(step.target, lookups), strong: true }, { text: ` to “${truncate(step.value, 40)}”` }];
    case "exit":
      return [{ text: "Exit the automation" }];
  }
}

export const toText = (parts: Part[]) => parts.map((p) => p.text).join("");

/** Short name of each step type, for menus and panel titles. */
export const STEP_LABELS: Record<AutomationStep["type"], string> = {
  send_email: "Send email",
  wait: "Wait",
  condition: "If/else",
  add_to_list: "Add to list",
  remove_from_list: "Remove from list",
  update_field: "Update a field",
  exit: "Exit",
};

export const TRIGGER_LABELS: Record<AutomationTrigger["type"], string> = {
  list_joined: "Joins a list",
  form_submitted: "Signs up through a form",
  contact_created: "New subscriber (any way)",
  date_anniversary: "Date or birthday",
  manual: "Added by hand",
};
