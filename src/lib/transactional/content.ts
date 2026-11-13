import "server-only";
import { db } from "@/lib/db";
import { emailDocumentSchema } from "@/lib/templates/document";
import { compileTemplate, buildMergeData, TemplateError, type MergeContact, type MergeData } from "@/lib/templates/personalize";
import { htmlToPlainText } from "@/lib/templates/plain-text";
import { InvalidDocumentError, renderDocument } from "@/lib/templates/render";
import { sanitizeCustomHtml } from "@/lib/templates/sanitize";
import type { ApiErrorCode, SendEmailInput } from "./schema";

// Builds the FINAL, personalised content of one transactional email:
// subject, HTML and plain text, ready to store and send.
//
// Two ways to give content:
//
//  1. templateId: one of the workspace's saved templates. Its design is
//     rendered exactly like a campaign (renderDocument → MJML → HTML).
//
//  2. html and/or text sent in the request:
//     - html only → the plain-text version is made from the HTML
//     - text only → a simple HTML version is made from the text
//     The HTML is cleaned with the same sanitizer as the editor's "HTML"
//     block (sanitizeCustomHtml): no scripts, forms, frames, event handlers
//     or javascript: links. NOTE: that sanitizer also removes <head>, <style>
//     and <body>, so CSS must be inline (style="..."), which is what email
//     clients like best anyway. We put the cleaned body in a small HTML shell.
//     Cleaning happens AFTER personalisation, so a value from `params` can
//     never sneak in an unsafe link either.
//
// Personalisation uses the same Liquid engine as campaigns, with:
//   {{ contact.FIRSTNAME }} ...  the workspace's contact with this address
//                                (only {{ contact.EMAIL }} if there is none)
//   {{ params.order_id }} ...    the request's "params"
//   {{ workspace.name }}, {{ current_year }}
//   {{ unsubscribe_url }}, {{ preferences_url }}, {{ view_in_browser_url }}
//                                → always "" for now: the public unsubscribe /
//                                preference pages only understand campaign
//                                links (see unsubscribeLinksFor below).
//
// NO TRACKING (decided for v1): transactional emails get no open pixel and no
// rewritten links. Opens/clicks are not recorded for them.

/** Largest personalised HTML we store/send (a loop in a template can grow it). */
const FINAL_HTML_MAX = 1_000_000;

export type ContentContact = MergeContact & { id: string };

export type BuiltContent =
  | { ok: true; subject: string; html: string; text: string }
  | { ok: false; code: ApiErrorCode; message: string; details?: unknown };

export async function buildContent(args: {
  workspace: { id: string; name: string };
  input: SendEmailInput;
  toEmail: string;
  contact: ContentContact | null;
  now?: Date;
}): Promise<BuiltContent> {
  const { workspace, input, toEmail, contact } = args;
  const data = mergeDataFor({ workspaceName: workspace.name, toEmail, contact, params: input.params, now: args.now });

  try {
    if (input.templateId) return await fromTemplate(workspace.id, input, data);
    return fromRaw(input, data);
  } catch (err) {
    if (err instanceof TemplateError) return { ok: false, code: "invalid_request", message: err.message, details: { part: err.part } };
    throw err;
  }
}

/** The values merge tags can use. */
function mergeDataFor(args: {
  workspaceName: string;
  toEmail: string;
  contact: ContentContact | null;
  params: Record<string, unknown> | undefined;
  now?: Date;
}): MergeData {
  const links = unsubscribeLinksFor(args.contact);
  const base = buildMergeData(args.contact ?? { email: args.toEmail, firstName: null, lastName: null, attributes: {} }, {
    workspaceName: args.workspaceName,
    unsubscribeUrl: links.unsubscribeUrl,
    preferencesUrl: links.preferencesUrl,
    viewInBrowserUrl: "", // transactional emails have no web version
    now: args.now,
  });
  return {
    ...base,
    // Not a contact: only the address is known.
    contact: args.contact ? base.contact : { EMAIL: args.toEmail },
    params: args.params ?? {},
  };
}

/**
 * Unsubscribe / preference-centre links for a transactional email.
 *
 * Always empty for now: the signed links in src/lib/campaigns/tokens.ts
 * point at a CAMPAIGN RECIPIENT row (/u/<token>, /p/<token>), and a
 * transactional email has none, so such a link would show "invalid link".
 * Giving a broken link is worse than none. When the public pages learn to
 * accept a contact-based token, fill these in here (only when a contact exists).
 */
function unsubscribeLinksFor(contact: ContentContact | null): { unsubscribeUrl: string; preferencesUrl: string } {
  void contact;
  return { unsubscribeUrl: "", preferencesUrl: "" };
}

async function fromTemplate(workspaceId: string, input: SendEmailInput, data: MergeData): Promise<BuiltContent> {
  // Filtering by workspace too: another workspace's template id simply isn't found.
  const template = await db.emailTemplate.findFirst({
    where: { id: input.templateId, workspaceId },
    select: { subject: true, preheader: true, document: true },
  });
  if (!template) {
    return { ok: false, code: "not_found", message: `There's no template with id "${input.templateId}" in this workspace.` };
  }
  const subject = input.subject || template.subject;
  if (!subject.trim()) {
    return {
      ok: false,
      code: "invalid_request",
      message: "This template has no subject line. Send a \"subject\" with the request, or add one to the template.",
    };
  }
  const doc = emailDocumentSchema.safeParse(template.document);
  if (!doc.success) {
    return { ok: false, code: "invalid_request", message: "The template's design has a problem. Open it in the editor and save it again." };
  }
  let rendered: { html: string; text: string };
  try {
    rendered = await renderDocument(doc.data, { subject, preheader: template.preheader });
  } catch (err) {
    if (err instanceof InvalidDocumentError) return { ok: false, code: "invalid_request", message: err.message };
    throw err;
  }
  const parts = compileTemplate({ html: rendered.html, text: rendered.text, subject }).render(data);
  return finish(parts);
}

function fromRaw(input: SendEmailInput, data: MergeData): BuiltContent {
  // The schema guarantees a subject and at least one of html/text here.
  const parts = compileTemplate({ html: input.html ?? "", text: input.text ?? "", subject: input.subject ?? "" }).render(data);

  let html: string;
  let text = parts.text;
  if (input.html !== undefined) {
    const body = sanitizeCustomHtml(parts.html);
    if (!body.trim()) {
      return {
        ok: false,
        code: "invalid_request",
        message: "Nothing is left of the HTML after removing unsafe parts (scripts, forms, ...). Send normal email HTML with inline styles.",
      };
    }
    html = htmlShell(parts.subject, body);
    if (input.text === undefined) text = htmlToPlainText(body);
  } else {
    html = htmlShell(parts.subject, textToHtml(parts.text));
  }
  return finish({ subject: parts.subject, html, text });
}

function finish(parts: { subject: string; html: string; text: string }): BuiltContent {
  if (!parts.subject.trim()) {
    return { ok: false, code: "invalid_request", message: "The subject is empty after filling in the merge tags." };
  }
  if (parts.html.length > FINAL_HTML_MAX) {
    return { ok: false, code: "invalid_request", message: "The email is too large after filling in the merge tags (over 1 MB of HTML)." };
  }
  return { ok: true, subject: parts.subject.slice(0, 998), html: parts.html, text: parts.text };
}

// ── Small HTML helpers ───────────────────────────────────────────────────────

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** A minimal, valid HTML document around an already-clean body. */
function htmlShell(subject: string, body: string): string {
  return (
    '<!DOCTYPE html><html><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    `<title>${escapeHtml(subject)}</title></head><body style="margin:0;padding:0">${body}</body></html>`
  );
}

/**
 * Plain text → simple, readable HTML: blank lines become paragraphs, single
 * line breaks become <br>, and web addresses become links. Everything is
 * escaped first, so the text can't add HTML of its own.
 */
function textToHtml(text: string): string {
  const paragraphs = text
    .replace(/\r\n?/g, "\n")
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => {
      const withLinks = escapeHtml(p).replace(/https?:\/\/[^\s<>"]+/g, (url) => {
        // Don't swallow a full stop or bracket that ends the sentence.
        const trail = /[.,;:!?)\]]+$/.exec(url)?.[0] ?? "";
        const clean = trail ? url.slice(0, -trail.length) : url;
        return `<a href="${clean}" target="_blank" rel="noopener">${clean}</a>${trail}`;
      });
      return `<p style="margin:0 0 16px">${withLinks.replace(/\n/g, "<br>")}</p>`;
    });
  return (
    '<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#111827;padding:16px">' +
    paragraphs.join("") +
    "</div>"
  );
}
