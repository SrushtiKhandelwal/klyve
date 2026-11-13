// What the user can ask the AI features for: the choices shown in the
// dialogs and the zod schemas the Server Actions check them with.
//
// Safe to import from server AND client (the browser uses the same lists).
import { z } from "zod";
import { isHttpUrl } from "@/lib/ai/safety";

// ── Generate campaign ───────────────────────────────────────────────────────

export const AI_TONES = [
  { value: "friendly", label: "Friendly" },
  { value: "professional", label: "Professional" },
  { value: "festive", label: "Festive" },
  { value: "urgent", label: "Urgent" },
] as const;
export type AiTone = (typeof AI_TONES)[number]["value"];

export const AI_LANGUAGES = [
  { value: "en", label: "English" },
  { value: "hi", label: "Hindi" },
  { value: "mr", label: "Marathi" },
] as const;
export type AiLanguage = (typeof AI_LANGUAGES)[number]["value"];

export const AI_INPUT_LIMITS = {
  aboutMin: 5,
  aboutMax: 500,
  buttonTextMax: 40,
  urlMax: 500,
  descriptionMax: 500,
} as const;

export const generateCampaignInputSchema = z.object({
  about: z
    .string()
    .trim()
    .min(AI_INPUT_LIMITS.aboutMin, "Tell the AI what the email is about (a few words at least).")
    .max(AI_INPUT_LIMITS.aboutMax, `Keep it under ${AI_INPUT_LIMITS.aboutMax} characters.`),
  tone: z.enum(AI_TONES.map((t) => t.value) as [AiTone, ...AiTone[]]),
  language: z.enum(AI_LANGUAGES.map((l) => l.value) as [AiLanguage, ...AiLanguage[]]),
  buttonText: z
    .string()
    .trim()
    .max(AI_INPUT_LIMITS.buttonTextMax, `Keep the button text under ${AI_INPUT_LIMITS.buttonTextMax} characters.`)
    .optional()
    .default(""),
  buttonUrl: z
    .string()
    .trim()
    .max(AI_INPUT_LIMITS.urlMax, "That link is too long.")
    .refine((v) => v === "" || isHttpUrl(v), "Use a full web address starting with https://")
    .optional()
    .default(""),
});
export type GenerateCampaignInput = z.input<typeof generateCampaignInputSchema>;

// ── Improve text ────────────────────────────────────────────────────────────

export const IMPROVE_ACTIONS = [
  { value: "shorter", label: "Make shorter" },
  { value: "friendlier", label: "Make friendlier" },
  { value: "professional", label: "More professional" },
  { value: "fix", label: "Fix spelling & grammar" },
  { value: "to_hi", label: "Translate to Hindi" },
  { value: "to_mr", label: "Translate to Marathi" },
  { value: "to_en", label: "Translate to English" },
] as const;
export type ImproveAction = (typeof IMPROVE_ACTIONS)[number]["value"];

/** Blocks the "Improve with AI" menu works on. */
export const IMPROVABLE_BLOCKS = ["heading", "text", "button"] as const;
export type ImprovableBlock = (typeof IMPROVABLE_BLOCKS)[number];

export const improveTextInputSchema = z.object({
  blockType: z.enum(IMPROVABLE_BLOCKS),
  action: z.enum(IMPROVE_ACTIONS.map((a) => a.value) as [ImproveAction, ...ImproveAction[]]),
  /** Rich text HTML for heading/text, the plain label for a button. */
  content: z.string().max(20_000, "This block is too long for the AI. Try a shorter one."),
});

// ── Segment / automation from a description ─────────────────────────────────

export const describeInputSchema = z
  .string()
  .trim()
  .min(5, "Describe it in a few words.")
  .max(AI_INPUT_LIMITS.descriptionMax, `Keep it under ${AI_INPUT_LIMITS.descriptionMax} characters.`);
