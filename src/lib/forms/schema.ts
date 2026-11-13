// The shape of a sign-up form's settings (SignupForm.config).
// Shared by the form builder, the live preview, the public form page and the
// submit endpoint. Safe to import from server AND client.
import { z } from "zod";
import { colorSchema } from "@/lib/templates/document";

/** Which contact field a form field fills in. Custom fields use "attr:<KEY>". */
export const fieldTargetSchema = z.union([
  z.literal("EMAIL"),
  z.literal("FIRSTNAME"),
  z.literal("LASTNAME"),
  z.string().regex(/^attr:[A-Z][A-Z0-9_]{0,39}$/, "Unknown field."),
]);

export const formFieldSchema = z.object({
  /** Stable id within the form (for React keys / drag order). */
  id: z.string().min(1).max(40),
  target: fieldTargetSchema,
  label: z.string().trim().min(1, "Every field needs a label.").max(80),
  placeholder: z.string().trim().max(120).default(""),
  required: z.boolean(),
});
export type FormField = z.infer<typeof formFieldSchema>;

export const formConfigSchema = z
  .object({
    /** Big text at the top, e.g. "Join our newsletter". */
    title: z.string().trim().max(120),
    /** One or two lines under the title. */
    description: z.string().trim().max(500),
    fields: z.array(formFieldSchema).min(1).max(12),
    buttonLabel: z.string().trim().min(1).max(40),
    /**
     * Consent wording next to a checkbox the visitor must tick, e.g.
     * "I agree to receive emails from Acme. I can unsubscribe at any time."
     * Empty = no checkbox (the submit button then counts as consent; the
     * text under the button still explains it).
     */
    consentText: z.string().trim().max(400),
    /** Shown after a successful sign-up (when not redirecting). */
    successTitle: z.string().trim().min(1).max(120),
    successMessage: z.string().trim().max(500),
    /** Optional: send people to this page after signing up instead. */
    redirectUrl: z
      .string()
      .trim()
      .max(2000)
      .refine((v) => v === "" || /^https?:\/\//i.test(v), "Use a full web address starting with https://"),
    /** Look. Colours default to the brand kit when the form is created. */
    style: z.object({
      accentColor: colorSchema,
      backgroundColor: colorSchema,
      textColor: colorSchema,
      /** "card" = white box with a border/shadow; "plain" = no box (blends into a site). */
      layout: z.enum(["card", "plain"]),
      showLogo: z.boolean(),
    }),
  })
  .refine((c) => c.fields.filter((f) => f.target === "EMAIL").length === 1, "A form needs exactly one Email field.")
  .refine((c) => new Set(c.fields.map((f) => f.target)).size === c.fields.length, "Each contact field can only be used once.")
  .refine((c) => c.fields.find((f) => f.target === "EMAIL")?.required === true, "The Email field must be required.");
export type FormConfig = z.infer<typeof formConfigSchema>;

/** A good starting form, in the workspace's brand colours. */
export function defaultFormConfig(opts: { companyName: string; primaryColor: string; textColor: string }): FormConfig {
  return {
    title: `Join the ${opts.companyName} newsletter`,
    description: "Get our latest news and offers straight to your inbox. No spam, unsubscribe any time.",
    fields: [
      { id: "f_first", target: "FIRSTNAME", label: "First name", placeholder: "Priya", required: false },
      { id: "f_email", target: "EMAIL", label: "Email", placeholder: "you@example.com", required: true },
    ],
    buttonLabel: "Subscribe",
    consentText: `I agree to receive emails from ${opts.companyName}. I can unsubscribe at any time.`,
    successTitle: "You're almost there!",
    successMessage: "Thanks for signing up. Please check your inbox to confirm your subscription.",
    redirectUrl: "",
    style: {
      accentColor: opts.primaryColor,
      backgroundColor: "#ffffff",
      textColor: opts.textColor,
      layout: "card",
      showLogo: true,
    },
  };
}

/** Name of the hidden anti-spam field. Real people never fill it in (it's invisible). */
export const HONEYPOT_FIELD = "website_url";
/** Name of the signed "form was shown at" timestamp field (bots submit instantly). */
export const RENDERED_AT_FIELD = "_ts";
