// Small shared rules for the "Sending providers" settings. Safe to import from
// BOTH server and client code: there is no database access and no secrets here.
import { z } from "zod";
import { PROVIDERS, SMTP_PRESETS, type ProviderTypeValue, type SmtpPreset } from "@/lib/email/provider-configs";

export const PROVIDER_NAME_MAX = 80;
export const MAX_PER_SECOND_MIN = 1;
export const MAX_PER_SECOND_MAX = 100;
export const DAILY_LIMIT_MAX = 10_000_000;

/** How many test emails one provider may send per hour (see provider-admin.ts). */
export const TEST_EMAILS_PER_HOUR = 10;

/** A valid email address (used for the test email's To and From). */
export const emailAddressSchema = z
  .string()
  .trim()
  .min(1, "Enter an email address.")
  .max(254, "That email address is too long.")
  .pipe(z.email("Please enter a valid email address."));

export function isEmailAddress(value: string): boolean {
  return emailAddressSchema.safeParse(value).success;
}

/** The fields shared by every provider type (not the credentials). */
export const providerSettingsSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Please give this provider a name.")
    .max(PROVIDER_NAME_MAX, `Keep the name under ${PROVIDER_NAME_MAX} characters.`)
    // The name goes into the test email's subject line, where a line break
    // could be abused to add extra email headers.
    .regex(/^[^\u0000-\u001f\u007f]*$/, "The name can't contain line breaks or tabs."),
  maxPerSecond: z.coerce
    .number({ message: "Enter a number." })
    .int("Use a whole number.")
    .min(MAX_PER_SECOND_MIN, `At least ${MAX_PER_SECOND_MIN} per second.`)
    .max(MAX_PER_SECOND_MAX, `At most ${MAX_PER_SECOND_MAX} per second.`),
  // Blank = no daily cap from our side.
  dailyLimit: z.preprocess(
    (v) => {
      const s = typeof v === "string" ? v.trim() : v;
      if (s === "" || s === null || s === undefined) return null;
      return typeof s === "string" ? Number(s) : s;
    },
    z
      .number({ message: "Enter a number, or leave it blank for no limit." })
      .int("Use a whole number.")
      .min(1, "Leave it blank for no limit, or enter at least 1.")
      .max(DAILY_LIMIT_MAX, "That limit is too large.")
      .nullable(),
  ),
});

/**
 * The SMTP presets shown in the form. In development we add a "Local test
 * server (Mailpit)" preset so you can try sending without a real account.
 */
export const MAILPIT_PRESET: SmtpPreset = {
  id: "mailpit",
  label: "Local test server (Mailpit)",
  host: "localhost",
  port: 1025,
  secure: false,
  note: "Development only. Any username and password work. See the emails at http://localhost:8025.",
  maxPerSecond: 10,
};

export function smtpPresets(includeDevPresets: boolean): SmtpPreset[] {
  return includeDevPresets ? [...SMTP_PRESETS, MAILPIT_PRESET] : SMTP_PRESETS;
}

/** Providers with an HTTP API need a From address they have verified. */
export function needsVerifiedFrom(type: ProviderTypeValue): boolean {
  return type !== "SMTP";
}

/**
 * A sensible From address for the test email.
 * - SMTP: the SMTP username if it is an email address (most servers only let
 *   you send as yourself), otherwise the logged-in user's email.
 * - Mailgun: an address on the connected sending domain.
 * - Resend: its shared test address (only delivers to your own Resend email).
 * - Others: the logged-in user's email; they can change it in the dialog.
 */
export function suggestedTestFrom(
  type: ProviderTypeValue,
  hint: Record<string, string>,
  userEmail: string,
): string {
  if (type === "SMTP") {
    return hint.username && isEmailAddress(hint.username) ? hint.username : userEmail;
  }
  if (type === "MAILGUN" && hint.domain) return `postmaster@${hint.domain}`;
  if (type === "RESEND") return "onboarding@resend.dev";
  return userEmail;
}

export function providerLabel(type: ProviderTypeValue): string {
  return PROVIDERS[type]?.label ?? type;
}

/** `{ host: "smtp.gmail.com:465", username: "you@gmail.com" }` → "smtp.gmail.com:465 · you@gmail.com" */
export function formatHint(hint: Record<string, string>): string {
  return Object.values(hint).filter(Boolean).join(" · ");
}
