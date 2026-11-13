// Ready-made automations ("recipes"): a working welcome series, birthday
// email, win-back… in one click.
//
//   RECIPES          what the gallery shows (from ./catalog.ts)
//   buildRecipe(id)  the full trigger + steps, with brand-aware emails
//
// No database access here: the caller (the builder's "new automation" page)
// looks up the workspace's brand, lists, forms and senders and passes them in
// `ctx`. Safe to import from server AND client.
//
// MISSING SETTINGS. A recipe always returns something that passes
// `triggerSchema` and `stepsSchema`, so it can be SAVED as a draft straight
// away. When the context doesn't have a value, the gap is left so that
// ACTIVATING fails with a clear message instead of silently doing the wrong
// thing:
//   - senderId null       → every "Send email" step has senderId null, which
//                           activationProblems() reports ("choose who it's from").
//   - listId / formId null → the trigger points at RECIPE_PLACEHOLDER_ID, which
//                           doesn't exist, so the engine's database check
//                           refuses to activate. The builder should treat it as
//                           "not chosen yet" (see isRecipePlaceholder).
//   - birthdayKey null    → the trigger uses "BIRTHDAY"; if the workspace has
//                           no such date field, the builder/engine flags it.
//   - The win-back "Re-engaged" list isn't in ctx (it usually doesn't exist
//     yet), so its "Add to list" step also uses RECIPE_PLACEHOLDER_ID, unless
//     the caller passes `reengagedListId`.
import {
  newStepId,
  stepsSchema,
  triggerSchema,
  type AutomationStep,
  type AutomationTrigger,
  type ConditionStep,
  type SendEmailStep,
  type WaitStep,
} from "@/lib/automations/schema";
import type { BrandTheme } from "@/lib/templates/document";
import {
  birthdayEmail,
  birthdayHeadsUpEmail,
  eventInviteEmail,
  eventLastCallEmail,
  eventReminderEmail,
  formNurtureEmail,
  formThankYouEmail,
  gettingTheMostEmail,
  lastChanceEmail,
  littleGiftEmail,
  onboardingTipEmail,
  singleWelcomeEmail,
  weMissYouEmail,
  welcomeEmail,
  welcomeResendEmail,
  type RecipeEmail,
} from "./emails";

export { RECIPES, RECIPE_CATEGORIES, TRIGGER_TYPE_LABELS, type RecipeCategory, type RecipeMeta } from "./catalog";

/** Stands in for a list or form that hasn't been chosen yet (never a real id). */
export const RECIPE_PLACEHOLDER_ID = "choose_one";

export function isRecipePlaceholder(id: string | null | undefined): boolean {
  return id === RECIPE_PLACEHOLDER_ID;
}

/** The custom field used by birthday recipes when the caller has none. */
export const DEFAULT_BIRTHDAY_KEY = "BIRTHDAY";

export type RecipeContext = {
  theme: BrandTheme;
  /** The list for "joined a list" recipes (e.g. the first list). */
  listId: string | null;
  /** The form for the "form submitted" recipe (null or left out = not chosen). */
  formId?: string | null;
  /** The verified sender for every email (null = the user picks later). */
  senderId: string | null;
  /** A DATE custom field key, e.g. "BIRTHDAY" (null or left out = "BIRTHDAY"). */
  birthdayKey?: string | null;
  /** Optional: the list the win-back recipe adds re-engaged people to. */
  reengagedListId?: string | null;
};

export type BuiltRecipe = {
  name: string;
  trigger: AutomationTrigger;
  steps: AutomationStep[];
  allowReentry: boolean;
};

// ── Step factories (fresh ids every time, so two automations never share them) ──

function email(ctx: RecipeContext, content: RecipeEmail): SendEmailStep {
  return {
    id: newStepId(),
    type: "send_email",
    name: content.name,
    subject: content.subject,
    preheader: content.preheader,
    senderId: ctx.senderId,
    document: content.document,
  };
}

function wait(amount: number, unit: WaitStep["unit"] = "days"): WaitStep {
  return { id: newStepId(), type: "wait", amount, unit };
}

/** "Did they open / click <email>?" → yes steps / no steps. */
function ifActivity(emailStep: SendEmailStep, action: "opened" | "clicked", yes: AutomationStep[], no: AutomationStep[]): ConditionStep {
  return { id: newStepId(), type: "condition", condition: { kind: "email_activity", stepId: emailStep.id, action }, yes, no };
}

const listOr = (id: string | null | undefined) => (id && id.trim() ? id : RECIPE_PLACEHOLDER_ID);

function birthdayTrigger(ctx: RecipeContext, daysBefore: number): AutomationTrigger {
  // Must look like a custom field key (A–Z, 0–9, _); anything else falls back.
  const key = ctx.birthdayKey && /^[A-Z][A-Z0-9_]{0,39}$/.test(ctx.birthdayKey) ? ctx.birthdayKey : DEFAULT_BIRTHDAY_KEY;
  return { type: "date_anniversary", attributeKey: key, daysBefore };
}

// ── The recipes ─────────────────────────────────────────────────────────────

type Builder = (ctx: RecipeContext) => BuiltRecipe;

const BUILDERS: Record<string, Builder> = {
  "welcome-series": (ctx) => {
    const welcome = email(ctx, welcomeEmail(ctx.theme));
    return {
      name: "Welcome series",
      trigger: { type: "list_joined", listId: listOr(ctx.listId) },
      steps: [
        welcome,
        wait(2),
        // Opened → go a step further. Didn't open → same welcome, new subject.
        ifActivity(welcome, "opened", [email(ctx, gettingTheMostEmail(ctx.theme))], [email(ctx, welcomeResendEmail(ctx.theme))]),
        wait(3),
        email(ctx, littleGiftEmail(ctx.theme)),
      ],
      allowReentry: false,
    };
  },

  "single-welcome": (ctx) => ({
    name: "Welcome email",
    trigger: { type: "contact_created" },
    steps: [email(ctx, singleWelcomeEmail(ctx.theme))],
    allowReentry: false,
  }),

  "onboarding-drip": (ctx) => ({
    name: "Onboarding tips",
    trigger: { type: "list_joined", listId: listOr(ctx.listId) },
    // Day 0, day 3 and day 7: three tips over the first week.
    steps: [
      email(ctx, onboardingTipEmail(ctx.theme, 1)),
      wait(3),
      email(ctx, onboardingTipEmail(ctx.theme, 2)),
      wait(4),
      email(ctx, onboardingTipEmail(ctx.theme, 3)),
    ],
    allowReentry: false,
  }),

  "form-thank-you": (ctx) => ({
    name: "Form thank-you + follow-up",
    trigger: { type: "form_submitted", formId: listOr(ctx.formId) },
    steps: [email(ctx, formThankYouEmail(ctx.theme)), wait(3), email(ctx, formNurtureEmail(ctx.theme))],
    allowReentry: false,
  }),

  // Birthdays come round every year, so the same person goes through again
  // (the engine still allows only one run per person per year).
  birthday: (ctx) => ({
    name: "Birthday email",
    trigger: birthdayTrigger(ctx, 0),
    steps: [email(ctx, birthdayEmail(ctx.theme))],
    allowReentry: true,
  }),

  "birthday-countdown": (ctx) => ({
    name: "Birthday heads-up + gift",
    trigger: birthdayTrigger(ctx, 3),
    steps: [email(ctx, birthdayHeadsUpEmail(ctx.theme)), wait(3), email(ctx, birthdayEmail(ctx.theme))],
    allowReentry: true,
  }),

  "win-back": (ctx) => {
    const missYou = email(ctx, weMissYouEmail(ctx.theme));
    return {
      name: "Win-back",
      trigger: { type: "manual" },
      steps: [
        missYou,
        wait(5),
        // Clicked → they're back: remember that with a list.
        // Didn't click → ask politely whether they still want our emails.
        ifActivity(
          missYou,
          "clicked",
          [{ id: newStepId(), type: "add_to_list", listId: listOr(ctx.reengagedListId) }],
          [email(ctx, lastChanceEmail(ctx.theme))],
        ),
      ],
      allowReentry: false,
    };
  },

  "event-reminders": (ctx) => {
    const reminder = email(ctx, eventReminderEmail(ctx.theme));
    return {
      name: "Event invitation + reminders",
      trigger: { type: "manual" },
      steps: [
        email(ctx, eventInviteEmail(ctx.theme)),
        wait(4),
        reminder,
        wait(2),
        // Only people who still haven't clicked get the last call.
        ifActivity(reminder, "clicked", [], [email(ctx, eventLastCallEmail(ctx.theme))]),
      ],
      allowReentry: false,
    };
  },
};

/**
 * The full automation for a recipe, ready to save as a DRAFT. null when the
 * id is unknown. See the top of this file for what happens to missing settings.
 */
export function buildRecipe(id: string, ctx: RecipeContext): BuiltRecipe | null {
  const builder = Object.hasOwn(BUILDERS, id) ? BUILDERS[id] : undefined;
  if (!builder) return null;
  const recipe = builder(ctx);
  // Belt and braces: a recipe must always be valid. If an edit ever breaks
  // one, fail loudly in development instead of saving a broken automation.
  triggerSchema.parse(recipe.trigger);
  stepsSchema.parse(recipe.steps);
  return recipe;
}
