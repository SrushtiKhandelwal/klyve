// The shape of an automation: ONE trigger, then a list of steps.
// Shared by the builder UI, the engine and the ready-made recipes.
// Safe to import from server AND client.
//
//   trigger → step → step → condition ─ yes → steps…
//                                     └ no  → steps…
//
// Steps are a TREE (a condition holds its own "yes" and "no" step lists),
// which is easy to draw top-to-bottom and impossible to turn into a loop.
import { z } from "zod";
import { emailDocumentSchema } from "@/lib/templates/document";

const id = z.string().min(1).max(40);

// ── Triggers ─────────────────────────────────────────────────────────────────

export const triggerSchema = z.discriminatedUnion("type", [
  /** Someone is added to a list (import, form, manual…) — and is subscribed. */
  z.object({ type: z.literal("list_joined"), listId: id }),
  /** Someone signs up through a specific form (after confirming, with double opt-in). */
  z.object({ type: z.literal("form_submitted"), formId: id }),
  /** Any new subscribed contact, however they were added. */
  z.object({ type: z.literal("contact_created") }),
  /**
   * Every year on a DATE field (e.g. BIRTHDAY), optionally some days before.
   * One run per contact per year.
   */
  z.object({
    type: z.literal("date_anniversary"),
    attributeKey: z.string().regex(/^[A-Z][A-Z0-9_]{0,39}$/),
    daysBefore: z.number().int().min(0).max(30),
  }),
  /** Only people you add by hand (from a contact's page or a segment). */
  z.object({ type: z.literal("manual") }),
]);
export type AutomationTrigger = z.infer<typeof triggerSchema>;
export type TriggerType = AutomationTrigger["type"];

// ── Conditions (for if/else steps) ──────────────────────────────────────────

export const conditionSchema = z.discriminatedUnion("kind", [
  /** Did they open / click the email sent by an earlier "send email" step? */
  z.object({ kind: z.literal("email_activity"), stepId: id, action: z.enum(["opened", "clicked"]) }),
  /** Are they in this list right now? */
  z.object({ kind: z.literal("in_list"), listId: id }),
  /** Do they match this saved segment right now? */
  z.object({ kind: z.literal("in_segment"), segmentId: id }),
]);
export type AutomationCondition = z.infer<typeof conditionSchema>;

// ── Steps ────────────────────────────────────────────────────────────────────

export const WAIT_UNITS = ["minutes", "hours", "days", "weeks"] as const;

const sendEmailStep = z.object({
  id,
  type: z.literal("send_email"),
  /** Shown in the builder and reports, e.g. "Welcome email". */
  name: z.string().trim().min(1).max(100),
  subject: z.string().trim().max(200),
  preheader: z.string().trim().max(200),
  /** Verified sender. null = not chosen yet (the automation can't be activated). */
  senderId: id.nullable(),
  document: emailDocumentSchema,
});

const waitStep = z.object({
  id,
  type: z.literal("wait"),
  amount: z.number().int().min(1).max(365),
  unit: z.enum(WAIT_UNITS),
});

const listStep = z.object({ id, type: z.enum(["add_to_list", "remove_from_list"]), listId: id });

const updateFieldStep = z.object({
  id,
  type: z.literal("update_field"),
  /** "FIRSTNAME", "LASTNAME" or "attr:KEY". */
  target: z.union([z.literal("FIRSTNAME"), z.literal("LASTNAME"), z.string().regex(/^attr:[A-Z][A-Z0-9_]{0,39}$/)]),
  /** Raw text; converted by the field's type when the step runs. Empty = clear. */
  value: z.string().max(500),
});

const exitStep = z.object({ id, type: z.literal("exit") });

export type SendEmailStep = z.infer<typeof sendEmailStep>;
export type WaitStep = z.infer<typeof waitStep>;
export type ListStep = z.infer<typeof listStep>;
export type UpdateFieldStep = z.infer<typeof updateFieldStep>;
export type ExitStep = z.infer<typeof exitStep>;
export type ConditionStep = {
  id: string;
  type: "condition";
  condition: AutomationCondition;
  yes: AutomationStep[];
  no: AutomationStep[];
};
export type AutomationStep = SendEmailStep | WaitStep | ListStep | UpdateFieldStep | ExitStep | ConditionStep;
export type StepType = AutomationStep["type"];

// z.lazy lets a condition contain more steps (the tree).
export const stepSchema: z.ZodType<AutomationStep> = z.lazy(() =>
  z.union([
    sendEmailStep,
    waitStep,
    listStep,
    updateFieldStep,
    exitStep,
    z.object({
      id,
      type: z.literal("condition"),
      condition: conditionSchema,
      yes: z.array(stepSchema).max(30),
      no: z.array(stepSchema).max(30),
    }),
  ]),
) as z.ZodType<AutomationStep>;

export const MAX_STEPS = 50;
export const MAX_DEPTH = 5;

export const stepsSchema = z
  .array(stepSchema)
  .max(30)
  .superRefine((steps, ctx) => {
    const ids = new Set<string>();
    let count = 0;
    const walk = (list: AutomationStep[], depth: number) => {
      if (depth > MAX_DEPTH) ctx.addIssue({ code: "custom", message: `If/else steps can be nested at most ${MAX_DEPTH} deep.` });
      for (const s of list) {
        count++;
        if (ids.has(s.id)) ctx.addIssue({ code: "custom", message: `Duplicate step id ${s.id}.` });
        ids.add(s.id);
        if (s.type === "condition") {
          walk(s.yes, depth + 1);
          walk(s.no, depth + 1);
        }
      }
    };
    walk(steps, 1);
    if (count > MAX_STEPS) ctx.addIssue({ code: "custom", message: `An automation can have at most ${MAX_STEPS} steps.` });
  });

// ── Helpers the engine and builder both need ────────────────────────────────

/** Every step in the tree, in reading order (top to bottom, yes-branch before no-branch). */
export function flattenSteps(steps: AutomationStep[]): AutomationStep[] {
  const out: AutomationStep[] = [];
  const walk = (list: AutomationStep[]) => {
    for (const s of list) {
      out.push(s);
      if (s.type === "condition") {
        walk(s.yes);
        walk(s.no);
      }
    }
  };
  walk(steps);
  return out;
}

export function findStep(steps: AutomationStep[], stepId: string): AutomationStep | null {
  return flattenSteps(steps).find((s) => s.id === stepId) ?? null;
}

/**
 * The step that comes AFTER `stepId` when there's no branching decision:
 * the next one in the same list, or — at the end of a branch — the step after
 * the condition that holds the branch (and so on outwards). null = the end.
 */
export function nextStepId(steps: AutomationStep[], stepId: string): string | null {
  const search = (list: AutomationStep[], after: string | null): { found: boolean; next: string | null } => {
    for (let i = 0; i < list.length; i++) {
      const s = list[i];
      const following = list[i + 1]?.id ?? after;
      if (s.id === stepId) return { found: true, next: following };
      if (s.type === "condition") {
        for (const branch of [s.yes, s.no]) {
          const r = search(branch, following);
          if (r.found) return r;
        }
      }
    }
    return { found: false, next: null };
  };
  return search(steps, null).next;
}

/** Wait length in milliseconds. */
export function waitMs(step: WaitStep): number {
  const unit = { minutes: 60_000, hours: 3_600_000, days: 86_400_000, weeks: 604_800_000 }[step.unit];
  return step.amount * unit;
}

export function newStepId(): string {
  const random =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().replace(/-/g, "").slice(0, 10)
      : Math.random().toString(36).slice(2, 12);
  return `st_${random}`;
}

/**
 * Problems that block ACTIVATING (not saving): missing sender, empty subject,
 * no unsubscribe link, references to emails that don't exist… The engine
 * re-checks lists/segments/forms/senders against the database separately.
 */
export function activationProblems(trigger: AutomationTrigger, steps: AutomationStep[]): string[] {
  const problems: string[] = [];
  const all = flattenSteps(steps);
  if (all.length === 0) problems.push("Add at least one step.");
  if (!all.some((s) => s.type === "send_email")) problems.push("Add at least one “Send email” step.");
  for (const s of all) {
    if (s.type === "send_email") {
      if (!s.senderId) problems.push(`“${s.name}”: choose who it's from.`);
      if (!s.subject.trim()) problems.push(`“${s.name}”: add a subject line.`);
      if (!JSON.stringify(s.document).match(/\{\{\s*unsubscribe_url\s*\}\}/)) {
        problems.push(`“${s.name}”: add an unsubscribe link (the Footer block has one).`);
      }
    }
    if (s.type === "condition" && s.condition.kind === "email_activity") {
      const refId = s.condition.stepId;
      const ref = all.find((x) => x.id === refId);
      if (!ref || ref.type !== "send_email") problems.push("An if/else step checks an email that no longer exists.");
    }
  }
  void trigger;
  return [...new Set(problems)];
}
