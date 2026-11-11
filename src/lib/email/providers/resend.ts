import "server-only";
import type { ResendCredentials } from "@/lib/email/provider-configs";
import { formatAddress, type PreparedEmail } from "@/lib/email/mime";
import { httpRequest, isFailure, keyRejected, mapHttpError, refusedEmail, str, type AdapterCheckResult, type AdapterSendResult, type Failure } from "./shared";

// Resend adapter. API docs: https://resend.com/docs/api-reference
const BASE_URL = "https://api.resend.com";

function authHeaders(config: ResendCredentials) {
  return { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json", Accept: "application/json" };
}

/** Resend tag names/values: letters, digits, "_" and "-" only (max 256). */
function toResendTags(tags: Record<string, string>) {
  const clean = (s: string) => s.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 256);
  return Object.entries(tags)
    .map(([name, value]) => ({ name: clean(name), value: clean(value) }))
    .filter((t) => t.name && t.value);
}

export async function send(config: ResendCredentials, email: PreparedEmail): Promise<AdapterSendResult> {
  const tags = toResendTags(email.tags);
  const res = await httpRequest("Resend", `${BASE_URL}/emails`, {
    method: "POST",
    headers: authHeaders(config),
    body: JSON.stringify({
      from: formatAddress(email.from),
      to: [formatAddress(email.to)],
      subject: email.subject,
      html: email.html || undefined,
      text: email.text,
      reply_to: email.replyTo,
      headers: Object.keys(email.headers).length ? email.headers : undefined,
      tags: tags.length ? tags : undefined,
    }),
  });
  if (isFailure(res)) return res;
  if (res.status >= 200 && res.status < 300) return { ok: true, providerMessageId: str(res.body, "id") };
  return mapResendError(res.status, res.body, config);
}

export async function check(config: ResendCredentials): Promise<AdapterCheckResult> {
  const res = await httpRequest("Resend", `${BASE_URL}/domains`, { method: "GET", headers: authHeaders(config) });
  if (isFailure(res)) return res;

  if (res.status >= 200 && res.status < 300) {
    const list = (res.body as { data?: { name?: string; status?: string }[] } | null)?.data ?? [];
    if (list.length === 0) {
      return { ok: true, detail: "API key works, but no domains are added in Resend yet. Add and verify your domain there before sending." };
    }
    const verified = list.filter((d) => d.status === "verified").map((d) => d.name);
    const pending = list.filter((d) => d.status !== "verified").map((d) => d.name);
    return {
      ok: true,
      detail:
        `API key works. Verified domains: ${verified.length ? verified.join(", ") : "none yet"}.` +
        (pending.length ? ` Not verified yet: ${pending.join(", ")}.` : ""),
    };
  }

  // "Sending access" keys can send but can't list domains. That's the
  // safest kind of key, so we accept it instead of failing the test.
  const name = str(res.body, "name") ?? "";
  const message = str(res.body, "message") ?? "";
  if (name === "restricted_api_key" || /restricted to only send/i.test(message)) {
    return { ok: true, detail: "This is a send-only API key, so we couldn't list your domains. It can send email; that's fine." };
  }
  return mapResendError(res.status, res.body, config);
}

function mapResendError(status: number, body: unknown, config: ResendCredentials): Failure {
  const name = str(body, "name") ?? "";
  const message = str(body, "message") ?? (typeof body === "string" ? body : "");
  // Resend isn't consistent here: a bad key can come back as 400, 401 or 403
  // (we saw "400 validation_error: API key is invalid" on GET /domains).
  if (["invalid_api_key", "missing_api_key", "restricted_api_key"].includes(name) || /api key is invalid|missing api key/i.test(message)) {
    return keyRejected("Resend", status, message, [config.apiKey]);
  }
  // Resend uses 403 for "domain not verified" and "testing emails only to
  // your own address": that's about this sender/recipient, not the key.
  if (status === 403 && name === "validation_error") return refusedEmail("Resend", status, message, [config.apiKey]);
  // 429 is used both for "too fast" and for the daily quota: both retryable.
  return mapHttpError("Resend", status, message, [config.apiKey]);
}
