import "server-only";
import { PROVIDERS, type ProviderCredentials } from "@/lib/email/provider-configs";
import type { ConnectionCheckResult, OutgoingEmail, SendResult } from "@/lib/email/types";
import { InvalidEmailError, prepareEmail, type PreparedEmail } from "@/lib/email/mime";
import { fail, scrubSecrets, type AdapterCheckResult, type AdapterSendResult, type ProviderLimits } from "@/lib/email/providers/shared";
import * as smtp from "@/lib/email/providers/smtp";
import * as ses from "@/lib/email/providers/ses";
import * as resend from "@/lib/email/providers/resend";
import * as sendgrid from "@/lib/email/providers/sendgrid";
import * as mailgun from "@/lib/email/providers/mailgun";
import * as postmark from "@/lib/email/providers/postmark";

// The ONE place the rest of the app sends email through a user's provider.
// It validates the email, picks the right adapter, and guarantees that what
// comes back is a friendly message with no secrets in it. It never throws.

export type { ProviderLimits };
/** A check result that may also carry the provider's rate limits (SES). */
export type CheckResultWithLimits = ConnectionCheckResult & { limits?: ProviderLimits };

/** Sends one email. Never throws; failures say whether a retry makes sense. */
export async function sendEmail(credentials: ProviderCredentials, email: OutgoingEmail): Promise<SendResult> {
  const result = await sendEmailDetailed(credentials, email);
  return result.ok
    ? { ok: true, providerMessageId: result.providerMessageId }
    : { ok: false, error: result.error, retryable: result.retryable };
}

/** Checks the credentials work (login / API key) without sending anything. Never throws. */
export async function checkConnection(credentials: ProviderCredentials): Promise<CheckResultWithLimits> {
  const result = await checkConnectionDetailed(credentials);
  if (result.ok) return { ok: true, detail: result.detail, limits: result.limits };
  return { ok: false, error: result.error };
}

// ── Internal versions (also used by stored-provider.ts) ──────────────────────
// They additionally tell whether a failure is the provider's fault
// (`providerIssue`) and whether a failed check is temporary (`retryable`).

export async function sendEmailDetailed(credentials: ProviderCredentials, email: OutgoingEmail): Promise<AdapterSendResult> {
  const parsed = validateCredentials(credentials);
  if (!parsed.ok) return parsed;
  const secrets = secretValues(parsed.credentials);

  let prepared: PreparedEmail;
  try {
    prepared = prepareEmail(email);
  } catch (err) {
    if (err instanceof InvalidEmailError) return fail(scrubSecrets(err.message, secrets), false);
    return fail("This email couldn't be prepared for sending.", false);
  }

  try {
    const result = await dispatchSend(parsed.credentials, prepared);
    return result.ok ? result : { ...result, error: scrubSecrets(result.error, secrets) };
  } catch (err) {
    // Adapters handle their own errors; this is a last safety net. We only
    // keep the error's NAME, since its message might contain anything.
    if (err instanceof InvalidEmailError) return fail(scrubSecrets(err.message, secrets), false);
    const name = err instanceof Error ? err.name : "unknown";
    return fail(`Unexpected error while sending (${name}).`, false);
  }
}

export async function checkConnectionDetailed(credentials: ProviderCredentials): Promise<AdapterCheckResult> {
  const parsed = validateCredentials(credentials);
  if (!parsed.ok) return parsed;
  const secrets = secretValues(parsed.credentials);
  try {
    const result = await dispatchCheck(parsed.credentials);
    return result.ok
      ? { ...result, detail: result.detail && scrubSecrets(result.detail, secrets) }
      : { ...result, error: scrubSecrets(result.error, secrets) };
  } catch (err) {
    const name = err instanceof Error ? err.name : "unknown";
    return fail(`Unexpected error while testing the connection (${name}).`, false);
  }
}

function dispatchSend(c: ProviderCredentials, email: PreparedEmail): Promise<AdapterSendResult> {
  switch (c.type) {
    case "SMTP": return smtp.send(c.config, email);
    case "AMAZON_SES": return ses.send(c.config, email);
    case "RESEND": return resend.send(c.config, email);
    case "SENDGRID": return sendgrid.send(c.config, email);
    case "MAILGUN": return mailgun.send(c.config, email);
    case "POSTMARK": return postmark.send(c.config, email);
  }
}

function dispatchCheck(c: ProviderCredentials): Promise<AdapterCheckResult> {
  switch (c.type) {
    case "SMTP": return smtp.check(c.config);
    case "AMAZON_SES": return ses.check(c.config);
    case "RESEND": return resend.check(c.config);
    case "SENDGRID": return sendgrid.check(c.config);
    case "MAILGUN": return mailgun.check(c.config);
    case "POSTMARK": return postmark.check(c.config);
  }
}

/**
 * Re-checks the credentials against the provider's schema (cheap), so a
 * malformed value becomes a clear error instead of a confusing crash, and
 * defaults (like Postmark's "broadcast" stream) are filled in.
 */
export function validateCredentials(
  credentials: ProviderCredentials,
): { ok: true; credentials: ProviderCredentials } | ReturnType<typeof fail> {
  const definition = credentials && typeof credentials === "object" ? PROVIDERS[credentials.type] : undefined;
  if (!definition) return fail("Unknown email provider type.", false, true);
  const result = definition.schema.safeParse(credentials.config);
  if (!result.success) {
    // Only field NAMES go into the message, never the values.
    const fields = [...new Set(result.error.issues.map((i) => String(i.path[0] ?? "settings")))];
    return fail(`The saved ${definition.label} settings are incomplete or invalid (${fields.join(", ")}). Please edit the provider and save it again.`, false, true);
  }
  return { ok: true, credentials: { type: credentials.type, config: result.data } as ProviderCredentials };
}

/** Every secret value in these credentials, so we can scrub them from messages. */
function secretValues(c: ProviderCredentials): string[] {
  const config = c.config as Record<string, unknown>;
  const values = PROVIDERS[c.type].fields
    .filter((f) => f.secret)
    .map((f) => config[f.name])
    .filter((v): v is string => typeof v === "string" && v.length > 0);
  if (c.type === "MAILGUN") values.push(Buffer.from(`api:${c.config.apiKey}`).toString("base64"));
  return values;
}
