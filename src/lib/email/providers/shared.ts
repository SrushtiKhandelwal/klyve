import "server-only";

// Small pieces shared by all provider adapters: result types, secret
// scrubbing, and a fetch helper with a timeout for the HTTP-based providers.

/** A failed send/check. */
export type Failure = {
  ok: false;
  /** Short, user-friendly, never contains secrets. */
  error: string;
  /** true = temporary problem (rate limit, timeout, server hiccup): worth retrying later. */
  retryable: boolean;
  /**
   * true = the provider itself is broken (wrong key, paused account, bad
   * settings), so EVERY email would fail. false/undefined = only this one
   * email was refused (bad recipient, unverified sender, ...). Only
   * provider problems mark a saved provider as FAILED.
   */
  providerIssue?: boolean;
};

export type AdapterSendResult = { ok: true; providerMessageId?: string } | Failure;

/** Rate limits a provider told us about, so the UI can suggest a speed limit. */
export type ProviderLimits = { maxPerSecond?: number; max24Hour?: number };

export type AdapterCheckResult = { ok: true; detail?: string; limits?: ProviderLimits } | Failure;

export function fail(error: string, retryable: boolean, providerIssue = false): Failure {
  return { ok: false, error, retryable, providerIssue };
}

/** One line, at most `max` characters: provider messages can be long. */
export function trimMessage(message: string, max = 240): string {
  const oneLine = message.replace(/\s+/g, " ").trim();
  return oneLine.length > max ? `${oneLine.slice(0, max - 1)}…` : oneLine;
}

// Things that look like API keys, even if we don't know the exact value.
const KEY_PATTERNS = [
  /\bre_[A-Za-z0-9_]{8,}/g, // Resend
  /\bSG\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, // SendGrid
  /\bkey-[0-9a-f]{20,}/gi, // old Mailgun keys
  /\b(?:AKIA|ASIA)[A-Z0-9]{12,}/g, // AWS access key IDs
  /\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}/gi, // Authorization header values
];

/**
 * Removes secrets from a message before we return or store it. `secrets`
 * are the exact values (password, API key, ...); we also blank anything
 * that merely looks like a key.
 */
export function scrubSecrets(message: string, secrets: string[]): string {
  let out = message;
  for (const secret of secrets) {
    // Very short values (e.g. "1") would mangle normal words; real secrets are longer.
    if (secret && secret.length >= 4) out = out.split(secret).join("••••");
  }
  for (const pattern of KEY_PATTERNS) {
    out = out.replace(pattern, (m) => (/^(bearer|basic)\s/i.test(m) ? `${m.split(/\s/)[0]} ••••` : "••••"));
  }
  return out;
}

export const HTTP_TIMEOUT_MS = 15_000;

export type HttpResponse = {
  status: number;
  headers: Headers;
  /** Parsed JSON when the body was JSON, otherwise the raw text. */
  body: unknown;
};

/**
 * fetch() with a 15 second timeout. Network problems and timeouts come back
 * as a retryable Failure (with no secrets in it) instead of throwing.
 *
 * Note: a timeout doesn't prove the email WASN'T sent (the provider may have
 * accepted it just before), so a retry can occasionally send twice.
 */
export async function httpRequest(
  provider: string,
  url: string,
  init: { method: string; headers: Record<string, string>; body?: string | URLSearchParams },
): Promise<HttpResponse | Failure> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: init.method,
      headers: init.headers,
      body: init.body,
      signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (err) {
    const name = err instanceof Error ? err.name : "";
    if (name === "TimeoutError" || name === "AbortError") {
      return fail(`${provider} didn't respond within ${HTTP_TIMEOUT_MS / 1000} seconds. Please try again.`, true);
    }
    // fetch() hides the real reason (DNS, connection reset, ...) in `cause`.
    const cause = err instanceof Error ? (err.cause as { code?: string } | undefined)?.code : undefined;
    return fail(`Couldn't reach ${provider}${cause ? ` (${cause})` : ""}. Check the server's internet connection.`, true);
  }

  const raw = await res.text().catch(() => "");
  let body: unknown = raw;
  if (raw && (res.headers.get("content-type") ?? "").includes("json")) {
    try {
      body = JSON.parse(raw);
    } catch {
      // Keep the text: it's still useful as an error message.
    }
  }
  return { status: res.status, headers: res.headers, body };
}

export function isFailure(value: HttpResponse | Failure): value is Failure {
  return "ok" in value && value.ok === false;
}

/** Reads `obj.key` as a string if it is one. */
export function str(obj: unknown, key: string): string | undefined {
  if (obj && typeof obj === "object" && key in obj) {
    const v = (obj as Record<string, unknown>)[key];
    if (typeof v === "string") return v;
    if (typeof v === "number") return String(v);
  }
  return undefined;
}

/**
 * The usual HTTP status → result mapping. Adapters handle their own special
 * cases first and fall back to this.
 *  - 401/403 → key rejected (not retryable, provider problem)
 *  - 404     → wrong settings (not retryable, provider problem)
 *  - 408/429/5xx → temporary (retryable)
 *  - other 4xx (400, 413, 422, ...) → this email was refused (not retryable)
 */
export function mapHttpError(provider: string, status: number, providerMessage: string | undefined, secrets: string[]): Failure {
  const suffix = providerSaid(provider, providerMessage, secrets);
  if (status === 401 || status === 403) return keyRejected(provider, status, providerMessage, secrets);
  if (status === 404) return fail(`${provider} returned "not found" (HTTP 404). Check your settings.${suffix}`, false, true);
  if (status === 408 || status === 429) {
    return fail(`${provider} is rate limiting us (HTTP ${status}). The email will be retried.${suffix}`, true);
  }
  if (status >= 500) return fail(`${provider} had a temporary problem (HTTP ${status}). Please try again.${suffix}`, true);
  return refusedEmail(provider, status, providerMessage, secrets);
}

/** "The API key is wrong" (not retryable, provider problem). */
export function keyRejected(provider: string, status: number, providerMessage: string | undefined, secrets: string[]): Failure {
  const said = providerSaid(provider, providerMessage, secrets);
  return fail(`API key rejected by ${provider} (HTTP ${status}). Check the key and its permissions.${said}`, false, true);
}

/** "This one email was refused" (not retryable, the provider itself is fine). */
export function refusedEmail(provider: string, status: number, providerMessage: string | undefined, secrets: string[]): Failure {
  return fail(`${provider} refused this email (HTTP ${status}).${providerSaid(provider, providerMessage, secrets)}`, false);
}

/** ` Resend said: "..."`, trimmed and with secrets removed (or "" if no message). */
export function providerSaid(provider: string, providerMessage: string | undefined, secrets: string[]): string {
  const quoted = providerMessage ? trimMessage(scrubSecrets(providerMessage, secrets)) : "";
  return quoted ? ` ${provider} said: "${quoted}"` : "";
}
