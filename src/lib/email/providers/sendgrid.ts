import "server-only";
import type { SendgridCredentials } from "@/lib/email/provider-configs";
import type { PreparedEmail } from "@/lib/email/mime";
import { fail, httpRequest, isFailure, mapHttpError, refusedEmail, type AdapterCheckResult, type AdapterSendResult, type Failure } from "./shared";

// SendGrid adapter (v3 Mail Send API).
// Docs: https://www.twilio.com/docs/sendgrid/api-reference/mail-send/mail-send
const BASE_URL = "https://api.sendgrid.com";

function authHeaders(config: SendgridCredentials) {
  return { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json", Accept: "application/json" };
}

export async function send(config: SendgridCredentials, email: PreparedEmail): Promise<AdapterSendResult> {
  const hasTags = Object.keys(email.tags).length > 0;
  // SendGrid requires text/plain to come before text/html.
  const content = [{ type: "text/plain", value: email.text }];
  if (email.html) content.push({ type: "text/html", value: email.html });

  const res = await httpRequest("SendGrid", `${BASE_URL}/v3/mail/send`, {
    method: "POST",
    headers: authHeaders(config),
    body: JSON.stringify({
      personalizations: [{ to: [email.to.name ? { email: email.to.email, name: email.to.name } : { email: email.to.email }] }],
      from: email.from.name ? { email: email.from.email, name: email.from.name } : { email: email.from.email },
      reply_to: email.replyTo ? { email: email.replyTo } : undefined,
      subject: email.subject,
      content,
      headers: Object.keys(email.headers).length ? email.headers : undefined,
      // custom_args come back to us in SendGrid's event webhooks (Phase 5).
      custom_args: hasTags ? email.tags : undefined,
    }),
  });
  if (isFailure(res)) return res;
  // Success is "202 Accepted" with an empty body; the id is in a header.
  if (res.status >= 200 && res.status < 300) {
    return { ok: true, providerMessageId: res.headers.get("x-message-id") ?? undefined };
  }
  return mapSendgridError(res.status, res.body, config);
}

export async function check(config: SendgridCredentials): Promise<AdapterCheckResult> {
  // /v3/scopes works for every valid key, even restricted ones, and tells
  // us whether the key is allowed to send ("mail.send").
  const res = await httpRequest("SendGrid", `${BASE_URL}/v3/scopes`, { method: "GET", headers: authHeaders(config) });
  if (isFailure(res)) return res;
  if (res.status >= 200 && res.status < 300) {
    const scopes = (res.body as { scopes?: unknown } | null)?.scopes;
    if (Array.isArray(scopes) && !scopes.includes("mail.send")) {
      return fail('This SendGrid API key doesn\'t have the "Mail Send" permission. Edit the key in SendGrid and give it Mail Send access.', false, true);
    }
    return {
      ok: true,
      detail: "API key works and is allowed to send. Make sure your From address or domain is verified in SendGrid (Sender Authentication).",
    };
  }
  return mapSendgridError(res.status, res.body, config);
}

/** SendGrid errors look like { errors: [{ message, field }] }. */
function sendgridMessage(body: unknown): string {
  const errors = (body as { errors?: { message?: string; field?: string | null }[] } | null)?.errors;
  if (Array.isArray(errors) && errors.length) {
    return errors
      .map((e) => (e.field ? `${e.field}: ${e.message ?? ""}` : (e.message ?? "")))
      .filter(Boolean)
      .join("; ");
  }
  return typeof body === "string" ? body : "";
}

function mapSendgridError(status: number, body: unknown, config: SendgridCredentials): Failure {
  const message = sendgridMessage(body);
  // SendGrid also uses 403 for "From address isn't a verified Sender
  // Identity": that's about this sender, not a broken key.
  if (status === 403 && /sender identity|from address/i.test(message)) {
    return refusedEmail("SendGrid", status, message, [config.apiKey]);
  }
  return mapHttpError("SendGrid", status, message, [config.apiKey]);
}
