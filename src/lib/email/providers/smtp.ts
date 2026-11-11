import "server-only";
import nodemailer, { type NodemailerError } from "nodemailer";
import type { SmtpCredentials } from "@/lib/email/provider-configs";
import type { PreparedEmail } from "@/lib/email/mime";
import { resolveSafeHost } from "./host-guard";
import { fail, scrubSecrets, trimMessage, type AdapterCheckResult, type AdapterSendResult, type Failure } from "./shared";

// SMTP adapter (Gmail, Outlook, Zoho, any mail server), using nodemailer.
//
// We open a fresh connection per call and always close it. That's simple
// and safe for now; Phase 4 (campaign sending) will add a connection pool
// so thousands of emails don't each pay for a new TLS handshake + login.

/**
 * `address` is the already-checked IP (or the host itself when the private
 * network guard is off). TLS still verifies the certificate against the
 * real host name via `servername`.
 */
function createTransport(config: SmtpCredentials, address: string) {
  return nodemailer.createTransport({
    host: address,
    port: config.port,
    // secure=true: TLS from the first byte (port 465). secure=false: start
    // plain and upgrade with STARTTLS when the server offers it (port 587).
    secure: config.secure,
    auth: { user: config.username, pass: config.password },
    // Fail fast instead of nodemailer's very long defaults (up to 10 minutes).
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
    dnsTimeout: 10_000,
    tls: { minVersion: "TLSv1.2", servername: config.host },
    // Never log SMTP traffic: it contains the login.
    logger: false,
    debug: false,
    // Message content must never read local files or fetch URLs.
    disableFileAccess: true,
    disableUrlAccess: true,
  });
}

export async function send(config: SmtpCredentials, email: PreparedEmail): Promise<AdapterSendResult> {
  const resolved = await resolveSafeHost(config.host);
  if (!resolved.ok) return fail(resolved.error, false, true);
  const transporter = createTransport(config, resolved.address);
  try {
    const info = await transporter.sendMail({
      from: email.from.name ? { name: email.from.name, address: email.from.email } : email.from.email,
      to: email.to.name ? { name: email.to.name, address: email.to.email } : email.to.email,
      replyTo: email.replyTo,
      subject: email.subject,
      html: email.html || undefined,
      text: email.text,
      headers: email.headers,
    });
    return { ok: true, providerMessageId: info.messageId };
  } catch (err) {
    return mapSmtpError(err, config);
  } finally {
    transporter.close();
  }
}

export async function check(config: SmtpCredentials): Promise<AdapterCheckResult> {
  const resolved = await resolveSafeHost(config.host);
  if (!resolved.ok) return fail(resolved.error, false, true);
  const transporter = createTransport(config, resolved.address);
  try {
    // verify() connects, does TLS/STARTTLS and logs in, without sending anything.
    await transporter.verify();
    return { ok: true, detail: `Connected to ${config.host}:${config.port} and signed in as ${config.username}.` };
  } catch (err) {
    return mapSmtpError(err, config);
  } finally {
    transporter.close();
  }
}

const TLS_HINT = 'Port 465 needs "Use SSL/TLS from the start" turned ON; port 587 needs it OFF.';

/** Turns a nodemailer error into a friendly, secret-free Failure. Exported for tests. */
export function mapSmtpError(err: unknown, config: SmtpCredentials): Failure {
  const e = (err ?? {}) as NodemailerError;
  const code = e.code ?? "";
  const original = e.originalCode ?? code;
  const rc = typeof e.responseCode === "number" ? e.responseCode : undefined;
  const secrets = [config.password];
  const serverSaid = (e.response || e.message) ? ` The server said: "${trimMessage(scrubSecrets(String(e.response || e.message), secrets), 200)}"` : "";
  const where = `${config.host}:${config.port}`;
  const message = String(e.message ?? "");

  // ── Login problems ──
  if (code === "EAUTH" || (rc !== undefined && [534, 535].includes(rc))) {
    return fail(`Login failed. Check the username and password. For Gmail use an App Password.${serverSaid}`, false, true);
  }
  if (code === "ENOAUTH") return fail("This server needs a username and password.", false, true);

  // ── Can't reach the server ──
  if (original === "ENOTFOUND" || code === "EDNS") {
    return fail(`Couldn't find the server "${config.host}". Check the host name for typos.`, false, true);
  }
  if (original === "EAI_AGAIN") return fail(`Couldn't look up "${config.host}" right now (DNS problem). Please try again.`, true);
  if (original === "ECONNREFUSED") {
    return fail(`${where} refused the connection. Check the port (usually 465 or 587) and that the host is right.`, true, true);
  }
  if (code === "ETIMEDOUT" || original === "ETIMEDOUT") {
    // A wrong secure setting typically shows up as a greeting timeout: both
    // sides are waiting for the other to speak first.
    const tlsMismatch = (config.port === 465 && !config.secure) || e.timeoutType === "GREETING_TIMEOUT";
    const hint = tlsMismatch ? ` ${TLS_HINT}` : " Check the host and port; some networks block outgoing email ports.";
    return fail(`Timed out talking to ${where}.${hint}`, true, true);
  }

  // ── TLS problems (usually the secure checkbox doesn't match the port) ──
  if (code === "ETLS" || (rc === undefined && /wrong version number|ssl routines|tls|certificate|self[- ]signed/i.test(message))) {
    if (/certificate|self[- ]signed/i.test(message)) {
      return fail(`The server's security certificate isn't trusted (${trimMessage(message, 120)}).`, false, true);
    }
    return fail(`Secure connection (TLS) to ${where} failed. ${TLS_HINT}`, false, true);
  }

  // ── The server answered with an SMTP error code ──
  if (rc !== undefined) {
    // 4xx = "try again later" (greylisting, rate limits, mailbox busy).
    if (rc >= 400 && rc < 500) return fail(`The server temporarily refused the email (code ${rc}).${serverSaid}`, true);
    if (rc === 530) {
      // "Authentication required" or "Must issue a STARTTLS command first".
      return fail(`The server requires a secure login (code 530). ${TLS_HINT}${serverSaid}`, false, true);
    }
    if (rc >= 500) {
      // Gmail & co. answer 5xx when the DAILY limit is hit: retry tomorrow.
      if (/quota|limit exceeded|too many|rate limit/i.test(String(e.response ?? ""))) {
        return fail(`The server's sending limit was reached (code ${rc}). Sending can resume later.${serverSaid}`, true);
      }
      // Everything else (unknown recipient, sender not allowed, spam
      // content, ...) is about THIS email: retrying won't help.
      return fail(`The server rejected this email (code ${rc}).${serverSaid}`, false);
    }
  }

  // ── Connection dropped mid-way ──
  if (["ECONNECTION", "ESOCKET", "ECONNRESET", "EPIPE"].includes(code) || original === "ECONNRESET") {
    return fail(`The connection to ${where} was interrupted. Please try again.`, true);
  }
  if (code === "EENVELOPE" || code === "EMESSAGE") {
    return fail(`The server didn't accept this email.${serverSaid}`, false);
  }

  return fail(`SMTP error${code ? ` (${code})` : ""}: ${trimMessage(scrubSecrets(message || "unknown error", secrets), 200)}`, false);
}
