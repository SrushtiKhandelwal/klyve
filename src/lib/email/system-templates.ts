import "server-only";
import { BRAND } from "@/lib/brand";

// HTML + plain-text bodies for Klyve's own emails.
// Email apps ignore <style> tags and modern CSS, so everything is a simple
// table with inline styles. Every email also has a plain-text version for
// apps that don't show HTML (and because spam filters like it).

type EmailContent = { subject: string; html: string; text: string };

/**
 * Makes a value safe to put inside HTML. Without this, a user named
 * `<script>...` or `"><a href=...>` could inject markup into our emails.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** "Hi Jane," or just "Hi," when we don't have a name. */
function greeting(name: string | null | undefined) {
  // Anyone can type anything as their name, so squash line breaks and cap the
  // length. That stops someone signing up with a "name" that is really a
  // paragraph of fake instructions or a phishing link.
  const cleaned = name?.replace(/\s+/g, " ").trim().slice(0, 50);
  return cleaned ? `Hi ${cleaned},` : "Hi,";
}

/** The shared frame: brand name, a white card, a big button and a fallback link. */
function layout(opts: {
  heading: string;
  name: string | null | undefined;
  intro: string;
  buttonLabel: string;
  url: string;
  footnote: string;
}): string {
  const url = escapeHtml(opts.url);
  const brand = escapeHtml(BRAND.name);

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(opts.heading)}</title>
  </head>
  <body style="margin:0;padding:0;background-color:#f0fdf4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#18181b;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f0fdf4;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;">
            <tr>
              <td style="padding:0 0 16px 0;font-size:20px;font-weight:700;color:#047857;text-align:center;">${brand}</td>
            </tr>
            <tr>
              <td style="background-color:#ffffff;border:1px solid #d1fae5;border-radius:12px;padding:32px 28px;">
                <h1 style="margin:0 0 16px 0;font-size:22px;line-height:1.3;font-weight:600;color:#18181b;">${escapeHtml(opts.heading)}</h1>
                <p style="margin:0 0 12px 0;font-size:15px;line-height:1.6;">${escapeHtml(greeting(opts.name))}</p>
                <p style="margin:0 0 24px 0;font-size:15px;line-height:1.6;">${escapeHtml(opts.intro)}</p>
                <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 24px 0;">
                  <tr>
                    <td style="border-radius:8px;background-color:#059669;">
                      <a href="${url}" target="_blank" style="display:inline-block;padding:12px 24px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">${escapeHtml(opts.buttonLabel)}</a>
                    </td>
                  </tr>
                </table>
                <p style="margin:0 0 8px 0;font-size:13px;line-height:1.6;color:#52525b;">If the button doesn't work, copy and paste this link into your browser:</p>
                <p style="margin:0 0 24px 0;font-size:13px;line-height:1.6;word-break:break-all;"><a href="${url}" target="_blank" style="color:#047857;">${url}</a></p>
                <p style="margin:0;font-size:13px;line-height:1.6;color:#71717a;">${escapeHtml(opts.footnote)}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 0 0 0;font-size:12px;color:#a1a1aa;text-align:center;">This is an automatic message from ${brand}.</td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

/** "Reset your password" email. The link is valid for 1 hour. */
export function resetPasswordEmail(opts: { name?: string | null; url: string }): EmailContent {
  const intro = `We got a request to reset the password for your ${BRAND.name} account. Click the button below to choose a new one. This link expires in 1 hour.`;
  const footnote =
    "If you didn't ask to reset your password, you can safely ignore this email. Your password won't change.";

  return {
    subject: `Reset your ${BRAND.name} password`,
    html: layout({
      heading: "Reset your password",
      name: opts.name,
      intro,
      buttonLabel: "Reset password",
      url: opts.url,
      footnote,
    }),
    text: [
      greeting(opts.name),
      "",
      intro,
      "",
      `Reset your password: ${opts.url}`,
      "",
      footnote,
      "",
      `- The ${BRAND.name} team`,
    ].join("\n"),
  };
}

/** "Verify your email address" email. The link is valid for 24 hours. */
export function verifyEmailEmail(opts: { name?: string | null; url: string }): EmailContent {
  const intro = `Thanks for signing up for ${BRAND.name}! Please confirm that this is your email address by clicking the button below. This link expires in 24 hours.`;
  const footnote = `If you didn't create a ${BRAND.name} account, you can safely ignore this email.`;

  return {
    subject: `Verify your email address for ${BRAND.name}`,
    html: layout({
      heading: "Verify your email address",
      name: opts.name,
      intro,
      buttonLabel: "Verify email address",
      url: opts.url,
      footnote,
    }),
    text: [
      greeting(opts.name),
      "",
      intro,
      "",
      `Verify your email: ${opts.url}`,
      "",
      footnote,
      "",
      `- The ${BRAND.name} team`,
    ].join("\n"),
  };
}
