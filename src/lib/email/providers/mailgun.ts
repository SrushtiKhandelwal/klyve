import "server-only";
import type { MailgunCredentials } from "@/lib/email/provider-configs";
import { formatAddress, type PreparedEmail } from "@/lib/email/mime";
import { fail, httpRequest, isFailure, mapHttpError, refusedEmail, str, type AdapterCheckResult, type AdapterSendResult, type Failure } from "./shared";

// Mailgun adapter. Docs: https://documentation.mailgun.com/docs/mailgun/api-reference/
// Accounts live in ONE region, and each region has its own API address.
const BASE_URLS = { us: "https://api.mailgun.net", eu: "https://api.eu.mailgun.net" } as const;

function authHeaders(config: MailgunCredentials) {
  // Mailgun uses HTTP Basic auth with the user name "api".
  return { Authorization: `Basic ${basicToken(config)}`, Accept: "application/json" };
}

function basicToken(config: MailgunCredentials) {
  return Buffer.from(`api:${config.apiKey}`).toString("base64");
}

/** Values to blank out of any error message. */
function secretsOf(config: MailgunCredentials) {
  return [config.apiKey, basicToken(config)];
}

function messagesUrl(config: MailgunCredentials) {
  return `${BASE_URLS[config.region]}/v3/${encodeURIComponent(config.domain)}/messages`;
}

export async function send(config: MailgunCredentials, email: PreparedEmail): Promise<AdapterSendResult> {
  const form = new URLSearchParams();
  form.set("from", formatAddress(email.from));
  form.set("to", formatAddress(email.to));
  form.set("subject", email.subject);
  if (email.html) form.set("html", email.html);
  form.set("text", email.text);
  if (email.replyTo) form.set("h:Reply-To", email.replyTo);
  // "h:Name" adds a custom header to the email.
  for (const [name, value] of Object.entries(email.headers)) form.append(`h:${name}`, value);
  // "v:name" attaches our own data; Mailgun returns it in webhooks (Phase 5).
  for (const [name, value] of Object.entries(email.tags)) form.append(`v:${name}`, value);

  const res = await httpRequest("Mailgun", messagesUrl(config), {
    method: "POST",
    headers: authHeaders(config), // fetch sets the form Content-Type itself
    body: form,
  });
  if (isFailure(res)) return res;
  if (res.status >= 200 && res.status < 300) {
    // Mailgun returns "<id@domain>"; webhooks use it without the brackets.
    const id = str(res.body, "id")?.replace(/^<|>$/g, "");
    return { ok: true, providerMessageId: id };
  }
  return mapMailgunError(res.status, res.body, config);
}

export async function check(config: MailgunCredentials): Promise<AdapterCheckResult> {
  const res = await httpRequest("Mailgun", `${BASE_URLS[config.region]}/v3/domains/${encodeURIComponent(config.domain)}`, {
    method: "GET",
    headers: authHeaders(config),
  });
  if (isFailure(res)) return res;

  if (res.status >= 200 && res.status < 300) {
    const domain = (res.body as { domain?: { state?: string; type?: string } } | null)?.domain ?? {};
    const notes: string[] = [`Domain ${config.domain} found (${config.region.toUpperCase()} region).`];
    if (domain.type === "sandbox") notes.push("This is a sandbox domain: Mailgun only delivers to the authorized recipients you add in Mailgun.");
    if (domain.state && domain.state !== "active") {
      notes.push(`Its DNS isn't verified yet (state: ${domain.state}). Finish domain verification in Mailgun before sending.`);
    }
    return { ok: true, detail: notes.join(" ") };
  }
  if (res.status === 404) {
    return fail(
      `Mailgun couldn't find the domain "${config.domain}" in the ${config.region.toUpperCase()} region. Check the domain name, and try the other region.`,
      false,
      true,
    );
  }
  if (res.status === 401 || res.status === 403) {
    // Domain "sending keys" may only call the send endpoint, so the domain
    // lookup is refused even though the key is fine. To tell a sending key
    // from a wrong key, we POST an EMPTY message: a valid key gets
    // "400 missing parameter" (nothing is sent), a wrong key gets 401.
    const probe = await httpRequest("Mailgun", messagesUrl(config), {
      method: "POST",
      headers: authHeaders(config),
      body: new URLSearchParams(),
    });
    if (!isFailure(probe) && probe.status === 400) {
      return {
        ok: true,
        detail: "This looks like a domain sending key: it can send, but can't read domain settings, so we skipped the domain check.",
      };
    }
    if (!isFailure(probe) && probe.status === 404) {
      return fail(`Mailgun couldn't find the domain "${config.domain}". Check the domain name and region.`, false, true);
    }
  }
  return mapMailgunError(res.status, res.body, config);
}

function mapMailgunError(status: number, body: unknown, config: MailgunCredentials): Failure {
  const message = str(body, "message") ?? (typeof body === "string" ? body : "");
  if (status === 401) {
    return fail(
      `API key rejected by Mailgun (HTTP 401). Check the key, and that the region (${config.region.toUpperCase()}) matches your Mailgun account.`,
      false,
      true,
    );
  }
  if (status === 404) {
    return fail(`Mailgun couldn't find the domain "${config.domain}". Check the domain name and region.`, false, true);
  }
  // Mailgun answers 403 for things like a sandbox domain sending to an
  // unauthorized recipient: about this email, not the key.
  if (status === 403 && /sandbox|authorized recipients|not allowed/i.test(message)) {
    return refusedEmail("Mailgun", status, message, secretsOf(config));
  }
  return mapHttpError("Mailgun", status, message, secretsOf(config));
}
