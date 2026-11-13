// What the recipe gallery shows about each ready-made automation.
//
// Just words and numbers (no email designs), so the client-side gallery stays
// tiny. The matching builders live in ./index.ts. Keep the two in sync: the
// recipe tests check that every id here builds, and that `emailCount` and
// `triggerType` match what the builder produces.
//
// Safe to import from server AND client.
import type { TriggerType } from "@/lib/automations/schema";

export const RECIPE_CATEGORIES = ["Welcome & onboarding", "Forms", "Birthdays", "Re-engagement", "Events"] as const;
export type RecipeCategory = (typeof RECIPE_CATEGORIES)[number];

export type RecipeMeta = {
  id: string;
  name: string;
  description: string;
  category: RecipeCategory;
  triggerType: TriggerType;
  /** How many "Send email" steps the recipe has (shown as "N emails"). */
  emailCount: number;
  /** The trigger in plain English, e.g. "When someone joins a list". */
  triggerLabel: string;
  /** What to check before turning it on (shown in the gallery and by the builder). */
  setupNote: string;
};

export const RECIPES: RecipeMeta[] = [
  {
    id: "welcome-series",
    name: "Welcome series",
    description:
      "Say hello the moment someone joins. Two days later, people who opened get tips; people who didn't get a second try with a new subject. A small welcome gift follows.",
    category: "Welcome & onboarding",
    triggerType: "list_joined",
    emailCount: 4,
    triggerLabel: "When someone joins a list",
    setupNote: "Choose the list and the sender, and change the WELCOME10 code to a real offer.",
  },
  {
    id: "single-welcome",
    name: "Welcome email",
    description: "One friendly welcome email for every new subscriber, however they joined. The simplest automation there is.",
    category: "Welcome & onboarding",
    triggerType: "contact_created",
    emailCount: 1,
    triggerLabel: "When a new subscriber is added",
    setupNote: "Choose the sender, then turn it on.",
  },
  {
    id: "onboarding-drip",
    name: "Onboarding tips",
    description: "Three short, helpful tips spread over a new subscriber's first week, so they get value from you straight away.",
    category: "Welcome & onboarding",
    triggerType: "list_joined",
    emailCount: 3,
    triggerLabel: "When someone joins a list",
    setupNote: "Choose the list and the sender, and adjust the tips to your business.",
  },
  {
    id: "form-thank-you",
    name: "Form thank-you + follow-up",
    description: "Thank people as soon as they fill in your sign-up form, then follow up three days later with what people love most about you.",
    category: "Forms",
    triggerType: "form_submitted",
    emailCount: 2,
    triggerLabel: "When someone submits a form",
    setupNote: "Choose the form and the sender.",
  },
  {
    id: "birthday",
    name: "Birthday email",
    description: "A cheerful birthday wish with a gift code, sent every year on each contact's birthday.",
    category: "Birthdays",
    triggerType: "date_anniversary",
    emailCount: 1,
    triggerLabel: "Every year on their birthday",
    setupNote: "Needs a date field such as BIRTHDAY on your contacts. Change the BIRTHDAY15 code to a real offer.",
  },
  {
    id: "birthday-countdown",
    name: "Birthday heads-up + gift",
    description: "Build a little excitement: a heads-up three days before someone's birthday, then the gift on the day itself.",
    category: "Birthdays",
    triggerType: "date_anniversary",
    emailCount: 2,
    triggerLabel: "Every year, 3 days before their birthday",
    setupNote: "Needs a date field such as BIRTHDAY on your contacts. Change the BIRTHDAY15 code to a real offer.",
  },
  {
    id: "win-back",
    name: "Win-back",
    description:
      "Re-engage quiet subscribers. Anyone who clicks “We miss you” joins a Re-engaged list; everyone else gets a polite “stay subscribed?” with a link to their preferences.",
    category: "Re-engagement",
    triggerType: "manual",
    emailCount: 2,
    triggerLabel: "When you add people by hand",
    setupNote: "Choose the sender, and pick (or create) a “Re-engaged” list for the “Add to list” step.",
  },
  {
    id: "event-reminders",
    name: "Event invitation + reminders",
    description: "Invite people to your event, remind them a few days later, and send a last call to anyone who still hasn't clicked.",
    category: "Events",
    triggerType: "manual",
    emailCount: 3,
    triggerLabel: "When you add people by hand",
    setupNote: "Choose the sender, then change the date, place and link in all three emails.",
  },
];

/** Plain-English words for each trigger type (for lists that only know the type). */
export const TRIGGER_TYPE_LABELS: Record<TriggerType, string> = {
  list_joined: "When someone joins a list",
  form_submitted: "When someone submits a form",
  contact_created: "When a new subscriber is added",
  date_anniversary: "Every year on a date (e.g. a birthday)",
  manual: "When you add people by hand",
};
