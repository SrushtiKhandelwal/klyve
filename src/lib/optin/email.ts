// The double opt-in confirmation email: "Please confirm your subscription".
//
// No server-only code here on purpose: Settings → Compliance renders the
// same function in the browser for its live preview, so what the user sees
// is exactly what gets sent.
//
// The workspace's message is PLAIN TEXT typed by a user. It is escaped and
// split into paragraphs; it can never add HTML, links or scripts. The button,
// the fallback link and the "ignore this email" line are fixed and always
// present, so every confirmation email tells people how to say no.

export const OPTIN_LIMITS = { subject: 150, message: 2000 } as const;

export const OPTIN_BUTTON_LABEL = "Yes, subscribe me";
export const OPTIN_IGNORE_NOTE = "If you didn't sign up, ignore this email — you won't be subscribed.";

/** The subject used when the workspace hasn't written its own. */
export function defaultOptInSubject(companyName: string): string {
  return `Please confirm your subscription to ${companyName}`;
}

/** The message used when the workspace hasn't written its own. */
export function defaultOptInMessage(companyName: string): string {
  return [
    `Thanks for signing up to hear from ${companyName}!`,
    "Please confirm that you want to receive our emails by clicking the button below. We won't send you anything else until you do.",
  ].join("\n\n");
}

export type OptInEmailBrand = {
  companyName: string;
  logoUrl: string | null;
  /** A validated hex colour for the button. */
  primaryColor: string;
  /** Postal address for the footer ("" = none). */
  address: string;
};

export type OptInEmail = { subject: string; html: string; text: string };

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Black or white text, whichever reads better on the button colour. */
function buttonTextColor(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return "#ffffff";
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16));
  // Simple perceived brightness (good enough for one button).
  return (r * 299 + g * 587 + b * 114) / 1000 > 160 ? "#18181b" : "#ffffff";
}

/** Plain text → paragraphs. Blank lines start a new paragraph; single line breaks stay. */
export function messageParagraphs(message: string): string[] {
  return message
    .replace(/\r\n?/g, "\n")
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}

/** A subject must be one line (a line break in a header could add new headers). */
export function cleanSubject(subject: string): string {
  return subject.replace(/[\r\n]+/g, " ").trim().slice(0, OPTIN_LIMITS.subject);
}

/** Builds the confirmation email for one person. `confirmUrl` is the /c/<token> link. */
export function renderOptInEmail(opts: {
  subject: string;
  message: string;
  confirmUrl: string;
  brand: OptInEmailBrand;
}): OptInEmail {
  const { brand } = opts;
  const subject = cleanSubject(opts.subject) || defaultOptInSubject(brand.companyName);
  const paragraphs = messageParagraphs(opts.message.slice(0, OPTIN_LIMITS.message));
  const url = escapeHtml(opts.confirmUrl);
  const color = /^#[0-9a-f]{6}$/i.test(brand.primaryColor) ? brand.primaryColor : "#059669";
  const company = escapeHtml(brand.companyName);
  const address = brand.address.trim();

  const header = brand.logoUrl
    ? `<img src="${escapeHtml(brand.logoUrl)}" alt="${company}" style="max-height:56px;max-width:220px;border:0;" />`
    : `<span style="font-size:20px;font-weight:700;color:#18181b;">${company}</span>`;

  const body = paragraphs
    .map(
      (p) =>
        `<p style="margin:0 0 16px 0;font-size:15px;line-height:1.6;">${escapeHtml(p).replace(/\n/g, "<br />")}</p>`,
    )
    .join("\n                ");

  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(subject)}</title>
  </head>
  <body style="margin:0;padding:0;background-color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#18181b;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">
            <tr>
              <td style="padding:0 0 16px 0;text-align:center;">${header}</td>
            </tr>
            <tr>
              <td style="background-color:#ffffff;border-radius:12px;border-top:4px solid ${color};padding:32px 28px;">
                ${body}
                <table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 24px 0;">
                  <tr>
                    <td style="border-radius:8px;background-color:${color};">
                      <a href="${url}" target="_blank" style="display:inline-block;padding:12px 24px;font-size:15px;font-weight:600;color:${buttonTextColor(color)};text-decoration:none;border-radius:8px;">${escapeHtml(OPTIN_BUTTON_LABEL)}</a>
                    </td>
                  </tr>
                </table>
                <p style="margin:0 0 8px 0;font-size:13px;line-height:1.6;color:#52525b;">If the button doesn't work, copy and paste this link into your browser:</p>
                <p style="margin:0 0 24px 0;font-size:13px;line-height:1.6;word-break:break-all;"><a href="${url}" target="_blank" style="color:${color};">${url}</a></p>
                <p style="margin:0;font-size:13px;line-height:1.6;color:#71717a;">${escapeHtml(OPTIN_IGNORE_NOTE)}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 8px 0 8px;font-size:12px;line-height:1.5;color:#a1a1aa;text-align:center;">${company}${
                address ? `<br />${escapeHtml(address).replace(/\r?\n/g, "<br />")}` : ""
              }</td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const text = [
    ...paragraphs,
    `${OPTIN_BUTTON_LABEL}: ${opts.confirmUrl}`,
    OPTIN_IGNORE_NOTE,
    "—",
    [brand.companyName, address].filter(Boolean).join("\n"),
  ].join("\n\n");

  return { subject, html, text };
}
