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

function getTransport(url: string): Transporter {
  if (globalForMailer.systemTransport && globalForMailer.systemTransportUrl === url) {
    return globalForMailer.systemTransport;
  }
  const transport = nodemailer.createTransport({
    url,
    // Timeouts (milliseconds) so a slow or dead SMTP server can't make a
    // login/reset request hang for minutes (nodemailer's defaults are huge).
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
    dnsTimeout: 10_000,
  });
  globalForMailer.systemTransport = transport;
  globalForMailer.systemTransportUrl = url;
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
  const smtpUrl = process.env.SYSTEM_SMTP_URL?.trim();

  if (!smtpUrl) {
    if (isProduction) {
      throw new Error(
        "SYSTEM_SMTP_URL is not set. Klyve can't send password-reset or verification emails. " +
          "Set it to your SMTP server, e.g. smtp://user:pass@smtp.example.com:587",
      );
    }
    // Development without a mail server: print the email so you can still
    // click the link. (This branch never runs in production, so tokens are
    // never written to production logs.)
    console.info(
      [
        "[system-email] SYSTEM_SMTP_URL is empty, so this email was NOT sent:",
        `  To:      ${to}`,
        `  Subject: ${subject}`,
        ...findLinks(text).map((link) => `  Link:    ${link}`),
      ].join("\n"),
    );
    return;
  }

  const from = process.env.SYSTEM_EMAIL_FROM?.trim() || `${BRAND.name} <no-reply@localhost>`;

  await getTransport(smtpUrl).sendMail({ from, to, subject, html, text });
}
