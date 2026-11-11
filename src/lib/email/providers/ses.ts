import "server-only";
import { GetAccountCommand, SendEmailCommand, SESv2Client, type MessageTag } from "@aws-sdk/client-sesv2";
import type { SesCredentials } from "@/lib/email/provider-configs";
import { buildRawMime, type PreparedEmail } from "@/lib/email/mime";
import { fail, scrubSecrets, trimMessage, type AdapterCheckResult, type AdapterSendResult, type Failure } from "./shared";

// Amazon SES adapter (SES API v2).
//
// We send the email as "Raw" MIME that we build ourselves, because SES's
// "Simple" mode can't carry custom headers such as List-Unsubscribe.
//
// A new client per call keeps things simple; Phase 4 will reuse clients
// (and their HTTPS connections) across a campaign.

function createClient(config: SesCredentials) {
  return new SESv2Client({
    region: config.region,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    // One attempt only: our own queue decides when to retry (Phase 4), and
    // hidden SDK retries could make one "send" take a long time.
    maxAttempts: 1,
    requestHandler: { connectionTimeout: 10_000, requestTimeout: 15_000 },
  });
}

/** SES tag names/values only allow letters, digits, "_", "-", "." and "@" (max 256). */
function toSesTags(tags: Record<string, string>): MessageTag[] {
  const clean = (s: string) => s.replace(/[^A-Za-z0-9_.@-]/g, "_").slice(0, 256);
  return Object.entries(tags)
    .map(([name, value]) => ({ Name: clean(name), Value: clean(value) }))
    .filter((t) => t.Name && t.Value)
    .slice(0, 50);
}

export async function send(config: SesCredentials, email: PreparedEmail): Promise<AdapterSendResult> {
  const client = createClient(config);
  try {
    const raw = await buildRawMime(email);
    const tags = toSesTags(email.tags);
    const out = await client.send(
      new SendEmailCommand({
        Destination: { ToAddresses: [email.to.email] },
        Content: { Raw: { Data: raw } },
        ConfigurationSetName: config.configurationSet,
        EmailTags: tags.length ? tags : undefined,
      }),
    );
    return { ok: true, providerMessageId: out.MessageId };
  } catch (err) {
    return mapSesError(err, config);
  } finally {
    client.destroy();
  }
}

export async function check(config: SesCredentials): Promise<AdapterCheckResult> {
  const client = createClient(config);
  try {
    const account = await client.send(new GetAccountCommand({}));
    if (account.SendingEnabled === false || account.EnforcementStatus === "SHUTDOWN") {
      return fail("Sending is paused for this Amazon SES account. Check the SES console (Reputation / Account dashboard).", false, true);
    }
    const quota = account.SendQuota ?? {};
    const parts: string[] = [];
    parts.push(
      account.ProductionAccessEnabled
        ? "Production access: you can send to any address."
        : "Sandbox mode: you can only send to verified addresses. Request production access in the SES console to email your contacts.",
    );
    if (quota.Max24HourSend !== undefined && quota.MaxSendRate !== undefined) {
      const max24 = quota.Max24HourSend < 0 ? "unlimited" : quota.Max24HourSend.toLocaleString("en-US");
      parts.push(`Quota: ${max24} emails per 24 hours, up to ${quota.MaxSendRate} per second (sent in the last 24 hours: ${(quota.SentLast24Hours ?? 0).toLocaleString("en-US")}).`);
    }
    if (account.EnforcementStatus === "PROBATION") {
      parts.push("Warning: your account is under review (probation) because of bounces or complaints.");
    }
    return {
      ok: true,
      detail: parts.join(" "),
      limits: {
        maxPerSecond: quota.MaxSendRate !== undefined ? Math.max(1, Math.floor(quota.MaxSendRate)) : undefined,
        max24Hour: quota.Max24HourSend !== undefined && quota.Max24HourSend >= 0 ? quota.Max24HourSend : undefined,
      },
    };
  } catch (err) {
    // The key works but isn't allowed to read account details. That's a
    // valid, locked-down setup (send-only IAM policy), so we report success.
    if (errorName(err) === "AccessDeniedException" || errorName(err) === "AccessDenied") {
      return {
        ok: true,
        detail: "Your access key works, but it isn't allowed to read account details (ses:GetAccount), so we couldn't check sandbox mode or quotas.",
      };
    }
    return mapSesError(err, config);
  } finally {
    client.destroy();
  }
}

function errorName(err: unknown): string {
  if (!err || typeof err !== "object") return "";
  const e = err as { name?: string; Code?: string; code?: string };
  // Plain Node network errors are named "Error"; their `code` (ECONNRESET, ...) says more.
  if ((!e.name || e.name === "Error") && (e.code || e.Code)) return e.code || e.Code || "";
  return e.name || e.Code || e.code || "";
}

/** Turns an AWS SDK error into a friendly, secret-free Failure. Exported for tests. */
export function mapSesError(err: unknown, config: SesCredentials): Failure {
  const e = (err ?? {}) as { name?: string; message?: string; $fault?: string; $metadata?: { httpStatusCode?: number }; $retryable?: unknown };
  const name = errorName(err);
  const status = e.$metadata?.httpStatusCode;
  const awsSaid = e.message ? trimMessage(scrubSecrets(e.message, [config.secretAccessKey]), 200) : "";
  const quoted = awsSaid ? ` Amazon SES said: "${awsSaid}"` : "";

  switch (name) {
    // ── Wrong keys / not allowed ──
    case "InvalidClientTokenId":
    case "UnrecognizedClientException":
    case "SignatureDoesNotMatch":
    case "InvalidSignatureException":
    case "IncompleteSignature":
      return fail(`Access key or secret is wrong. Also check the region (${config.region}).`, false, true);
    case "ExpiredToken":
    case "ExpiredTokenException":
      return fail("These AWS credentials have expired. Create a new access key.", false, true);
    case "AccessDeniedException":
    case "AccessDenied":
      return fail("This AWS key isn't allowed to send email. Give the IAM user the ses:SendEmail permission.", false, true);

    // ── The whole account can't send ──
    case "AccountSuspendedException":
    case "SendingPausedException":
    case "AccountSendingPausedException":
      return fail("Sending is paused for this Amazon SES account. Check the SES console.", false, true);
    case "NotFoundException":
      return fail(`Amazon SES couldn't find a resource (usually the configuration set "${config.configurationSet ?? ""}").${quoted}`, false, true);

    // ── This particular email was refused ──
    case "MessageRejected": {
      const sandbox = /not verified/i.test(e.message ?? "")
        ? " In sandbox mode SES only sends to verified addresses, and the From address must be verified too."
        : "";
      return fail(`Amazon SES rejected this email.${sandbox}${quoted}`, false);
    }
    case "MailFromDomainNotVerifiedException":
      return fail(`The sender's domain isn't verified in Amazon SES (region ${config.region}).${quoted}`, false);
    case "BadRequestException":
      return fail(`Amazon SES refused the request.${quoted}`, false);

    // ── Temporary: slow down and retry ──
    case "TooManyRequestsException":
    case "ThrottlingException":
    case "Throttling":
      return fail("Amazon SES is rate limiting us (too many emails per second). The email will be retried.", true);
    case "LimitExceededException":
      return fail(`Amazon SES sending limit reached. Sending can resume later.${quoted}`, true);
    case "InternalServiceErrorException":
    case "InternalFailure":
    case "ServiceUnavailable":
    case "ServiceUnavailableException":
      return fail("Amazon SES had a temporary problem. Please try again.", true);

    // ── Network trouble ──
    case "TimeoutError":
    case "RequestTimeout":
    case "RequestTimeoutException":
    case "ETIMEDOUT":
      return fail("Amazon SES didn't respond in time. Please try again.", true);
    case "ENOTFOUND":
    case "EAI_AGAIN":
    case "ECONNRESET":
    case "ECONNREFUSED":
    case "NetworkingError":
      return fail("Couldn't reach Amazon SES. Check the server's internet connection.", true);
  }

  if (status === 429 || e.$fault === "server" || (status !== undefined && status >= 500)) {
    return fail(`Amazon SES had a temporary problem.${quoted}`, true);
  }
  if (status === 401 || status === 403) return fail("Access key or secret is wrong.", false, true);
  return fail(`Amazon SES error${name ? ` (${name})` : ""}.${quoted}`, false);
}
