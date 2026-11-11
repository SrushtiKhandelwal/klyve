import "server-only";
import MailComposer from "nodemailer/lib/mail-composer";
import type { EmailAddress, OutgoingEmail } from "@/lib/email/types";

// Helpers shared by every provider adapter: checking an email is safe to send,
// formatting addresses, making a plain-text version, and building raw MIME.

/** Thrown when an email itself is invalid (bad address, line break in a header, ...). */
export class InvalidEmailError extends Error {}

/** An email that passed `prepareEmail`: always has text, headers and tags. */
export type PreparedEmail = OutgoingEmail & {
  text: string;
  headers: Record<string, string>;
  tags: Record<string, string>;
};

// A line break inside a header value would let someone start a NEW header
// (e.g. a hidden "Bcc:"). This is called "header injection", so we refuse
// CR, LF and NUL anywhere in header-like values.
const UNSAFE_HEADER_CHARS = /[\r\n\0]/;

// Deliberately simple: one "@", no spaces/brackets/quotes, a dot in the domain.
const EMAIL_RE = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[^\s@<>()[\]\\,;:".]{2,}$/;

// Header names: letters, digits and dashes only (e.g. "List-Unsubscribe").
const HEADER_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9-]{0,75}$/;

// Headers we set ourselves. Letting callers override them would break the
// message (or allow sneaky extra recipients), so they're rejected.
const RESERVED_HEADERS = new Set([
  "from", "to", "cc", "bcc", "reply-to", "subject", "sender", "date", "message-id",
  "mime-version", "content-type", "content-transfer-encoding", "return-path",
]);

function assertSafe(label: string, value: string) {
  if (UNSAFE_HEADER_CHARS.test(value)) {
    throw new InvalidEmailError(`${label} must not contain line breaks.`);
  }
}

export function isValidEmailAddress(email: string): boolean {
  return email.length <= 254 && EMAIL_RE.test(email);
}

function checkAddress(label: string, address: EmailAddress | undefined): EmailAddress {
  if (!address || typeof address.email !== "string") {
    throw new InvalidEmailError(`${label} address is missing.`);
  }
  const email = address.email.trim();
  assertSafe(`${label} address`, email);
  if (!isValidEmailAddress(email)) {
    throw new InvalidEmailError(`${label} address "${email.slice(0, 100)}" is not a valid email address.`);
  }
  const name = typeof address.name === "string" ? address.name.trim() : "";
  if (name) assertSafe(`${label} name`, name);
  return name ? { email, name } : { email };
}

/**
 * Validates an email before it goes to any provider and fills in the
 * defaults (plain-text version, empty headers/tags). Throws InvalidEmailError.
 */
export function prepareEmail(email: OutgoingEmail): PreparedEmail {
  const from = checkAddress("From", email.from);
  const to = checkAddress("To", email.to);

  let replyTo: string | undefined;
  if (email.replyTo && email.replyTo.trim()) {
    replyTo = email.replyTo.trim();
    assertSafe("Reply-to address", replyTo);
    if (!isValidEmailAddress(replyTo)) {
      throw new InvalidEmailError(`Reply-to address "${replyTo.slice(0, 100)}" is not a valid email address.`);
    }
  }

  const subject = typeof email.subject === "string" ? email.subject.trim() : "";
  if (!subject) throw new InvalidEmailError("Subject is required.");
  assertSafe("Subject", subject);

  const html = typeof email.html === "string" ? email.html : "";
  const givenText = typeof email.text === "string" ? email.text : "";
  if (!html.trim() && !givenText.trim()) throw new InvalidEmailError("The email has no content.");
  // A plain-text part helps deliverability, so we always send one.
  const text = givenText.trim() ? givenText : htmlToText(html);

  const headers: Record<string, string> = {};
  for (const [name, value] of Object.entries(email.headers ?? {})) {
    if (!HEADER_NAME_RE.test(name)) throw new InvalidEmailError(`"${name.slice(0, 80)}" is not a valid header name.`);
    if (RESERVED_HEADERS.has(name.toLowerCase())) {
      throw new InvalidEmailError(`The "${name}" header is set automatically and can't be overridden.`);
    }
    const v = String(value);
    assertSafe(`Header "${name}"`, v);
    headers[name] = v;
  }

  const tags: Record<string, string> = {};
  for (const [key, value] of Object.entries(email.tags ?? {})) {
    const v = String(value);
    assertSafe(`Tag "${key.slice(0, 40)}"`, key);
    assertSafe(`Tag "${key.slice(0, 40)}"`, v);
    tags[key] = v;
  }

  return { from, to, replyTo, subject, html, text, headers, tags };
}

/**
 * `"Jane Doe" <jane@example.com>`, with the name quoted and escaped so a
 * name like `Acme, Inc.` or one containing quotes can't break the header.
 * Used for HTTP APIs that take a single "from" string.
 */
export function formatAddress(address: EmailAddress): string {
  assertSafe("Address", address.email);
  if (!address.name) return address.email;
  assertSafe("Name", address.name);
  const escaped = address.name.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return `"${escaped}" <${address.email}>`;
}

const ENTITIES: Record<string, string> = {
  nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", "#39": "'",
  copy: "©", reg: "®", trade: "™", hellip: "…", mdash: "—", ndash: "–",
  rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", bull: "•", euro: "€", pound: "£", rupee: "₹",
};

function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+\d*);/gi, (match, code: string) => {
    const lower = code.toLowerCase();
    if (lower.startsWith("#x") || lower.startsWith("#")) {
      const n = lower.startsWith("#x") ? parseInt(lower.slice(2), 16) : parseInt(lower.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : match;
    }
    return ENTITIES[lower] ?? match;
  });
}

/**
 * A simple plain-text version of an HTML email. Not perfect, but readable:
 * keeps paragraphs and line breaks, shows links as "text (url)", drops
 * styles/scripts and all other tags.
 */
export function htmlToText(html: string): string {
  let s = html;
  s = s.replace(/<!--[\s\S]*?-->/g, "");
  s = s.replace(/<(head|style|script|title)\b[\s\S]*?<\/\1\s*>/gi, "");
  // Links: show the URL after the text, unless the text already is the URL.
  s = s.replace(/<a\b[^>]*?href\s*=\s*(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a\s*>/gi, (_m, _q, href: string, inner: string) => {
    const label = inner.replace(/<[^>]+>/g, "").trim();
    const url = decodeEntities(href.trim());
    if (!url || url.startsWith("#") || (/^mailto:/i.test(url) && label.includes(url.slice(7)))) return label;
    if (!label || decodeEntities(label) === url) return url;
    return `${label} (${url})`;
  });
  s = s.replace(/<br\s*\/?>/gi, "\n");
  s = s.replace(/<li\b[^>]*>/gi, "\n- ");
  s = s.replace(/<\/(p|div|h[1-6]|tr|table|ul|ol|blockquote|section|article|header|footer)\s*>/gi, "\n\n");
  s = s.replace(/<(p|div|h[1-6]|tr|table|blockquote)\b[^>]*>/gi, "\n");
  s = s.replace(/<\/(td|th)\s*>/gi, " ");
  s = s.replace(/<hr\b[^>]*>/gi, "\n----------\n");
  s = s.replace(/<[^>]+>/g, "");
  s = decodeEntities(s);
  s = s
    .split("\n")
    .map((line) => line.replace(/[ \t\f\v ]+/g, " ").trim())
    .join("\n");
  return s.replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * Builds the complete raw email (headers + multipart text/html body) as
 * bytes, the same way nodemailer would for SMTP. Used for Amazon SES "Raw"
 * sending so custom headers (like List-Unsubscribe) are kept exactly.
 */
export async function buildRawMime(email: PreparedEmail): Promise<Buffer> {
  const composer = new MailComposer({
    from: email.from.name ? { name: email.from.name, address: email.from.email } : email.from.email,
    to: email.to.name ? { name: email.to.name, address: email.to.email } : email.to.email,
    replyTo: email.replyTo,
    subject: email.subject,
    text: email.text,
    html: email.html || undefined,
    headers: email.headers,
    // Never let message content read local files or fetch URLs.
    disableFileAccess: true,
    disableUrlAccess: true,
    newline: "win", // CRLF line endings, as the email standard requires
  });
  return composer.compile().build();
}
