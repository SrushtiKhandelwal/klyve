import "server-only";
import nodemailer, { type Transporter } from "nodemailer";
import { BRAND } from "@/lib/brand";

// Sends Klyve's OWN emails (password reset, email verification).
// These are NOT campaign emails: they always go through the SMTP server in
// SYSTEM_SMTP_URL, never through a customer's sending provider.
//
// In development SYSTEM_SMTP_URL points at Mailpit (a fake inbox at
// http://localhost:8025), so nothing is really delivered.

export type SystemEmail = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

const isProduction = process.env.NODE_ENV === "production";

// Keep ONE transport for the whole server instead of opening a new SMTP
// connection setup for every email. In development Next.js reloads modules
// often, so we keep it on globalThis (same trick as src/lib/db.ts).
const globalForMailer = globalThis as unknown as {
  systemTransport?: Transporter;
  systemTransportUrl?: string;
};

// Timeouts (milliseconds) so a slow or dead SMTP server can't make a
// login/reset request hang for minutes (nodemailer's defaults are huge).
const TIMEOUTS = { connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 20_000, dnsTimeout: 10_000 };

type SmtpConfig =
  | { kind: "url"; url: string }
  | { kind: "parts"; host: string; port: number; user: string; pass: string };

/**
 * Where Klyve's own emails go. Two ways to set it:
 * 1. SYSTEM_SMTP_HOST + SYSTEM_SMTP_USER + SYSTEM_SMTP_PASS (+ optional
 *    SYSTEM_SMTP_PORT, default 465): easiest, because the password can be
 *    pasted as-is (no URL encoding of "/", "+" or "=").
 * 2. SYSTEM_SMTP_URL, e.g. smtps://user:pass@host:465 (special characters in
 *    the password must be URL-encoded).
 */
function getSmtpConfig(): SmtpConfig | null {
  const host = process.env.SYSTEM_SMTP_HOST?.trim();
  const user = process.env.SYSTEM_SMTP_USER?.trim();
  const pass = process.env.SYSTEM_SMTP_PASS?.trim();
  if (host && user && pass) {
    const port = Number(process.env.SYSTEM_SMTP_PORT?.trim() || 465);
    return { kind: "parts", host, port: Number.isInteger(port) && port > 0 ? port : 465, user, pass };
  }
  const url = process.env.SYSTEM_SMTP_URL?.trim();
  return url ? { kind: "url", url } : null;
}

function getTransport(config: SmtpConfig): Transporter {
  // Reuse the transport while the settings stay the same.
  const key = JSON.stringify(config);
  if (globalForMailer.systemTransport && globalForMailer.systemTransportUrl === key) {
    return globalForMailer.systemTransport;
  }
  const transport =
    config.kind === "url"
      ? nodemailer.createTransport({ url: config.url, ...TIMEOUTS })
      : nodemailer.createTransport({
          host: config.host,
          port: config.port,
          // 465 = TLS from the start; 587 = must upgrade with STARTTLS.
          secure: config.port === 465,
          requireTLS: config.port === 587,
          auth: { user: config.user, pass: config.pass },
          ...TIMEOUTS,
        });
  globalForMailer.systemTransport = transport;
  globalForMailer.systemTransportUrl = key;
  return transport;
}

/** Pulls every http(s) link out of an email, for the development console log. */
function findLinks(text: string): string[] {
  return Array.from(new Set(text.match(/https?:\/\/[^\s"'<>]+/g) ?? []));
}

/**
 * Sends one system email.
 *
 * Throws if sending fails. Callers in auth.ts catch the error and only log it,
 * so a broken mail server never changes what the visitor sees (which would
 * reveal whether an account exists).
 */
export async function sendSystemEmail({ to, subject, html, text }: SystemEmail): Promise<void> {
  const smtp = getSmtpConfig();

  if (!smtp) {
    if (isProduction) {
      throw new Error(
        "No SMTP server is set, so Klyve can't send password-reset or verification emails. " +
          "Set SYSTEM_SMTP_HOST, SYSTEM_SMTP_USER and SYSTEM_SMTP_PASS (or SYSTEM_SMTP_URL).",
      );
    }
    // Development without a mail server: print the email so you can still
    // click the link. (This branch never runs in production, so tokens are
    // never written to production logs.)
    console.info(
      [
        "[system-email] No SMTP server is set, so this email was NOT sent:",
        `  To:      ${to}`,
        `  Subject: ${subject}`,
        ...findLinks(text).map((link) => `  Link:    ${link}`),
      ].join("\n"),
    );
    return;
  }

  const from = process.env.SYSTEM_EMAIL_FROM?.trim() || `${BRAND.name} <no-reply@localhost>`;

  await getTransport(smtp).sendMail({ from, to, subject, html, text });
}
