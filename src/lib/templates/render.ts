import "server-only";
import mjml2html from "mjml";
import {
  documentWarnings,
  emailDocumentSchema,
  type Block,
  type Column,
  type DocumentSettings,
  type EmailDocument,
  type Padding,
  type Section,
  type SocialNetwork,
} from "@/lib/templates/document";
import { documentToPlainText } from "@/lib/templates/plain-text";
import { isSafeImageSrc, isSafeLink, sanitizeCustomHtml, sanitizeRichText, withSafeUrlFilter } from "@/lib/templates/sanitize";

// Turns an EmailDocument (the editor's design) into email-safe HTML.
//
//   EmailDocument → MJML (a markup language made for email) → HTML
//
// MJML does the hard part: tables for Outlook, media queries so columns stack
// on phones, and other email-client workarounds.
//
// MERGE TAGS: the HTML still contains {{ contact.FIRSTNAME }} and friends.
// They are filled in per contact by personalize.ts. Everything here is
// HTML-escaped as usual, INCLUDING the text of merge tags, so the output is
// always valid HTML, e.g. an alt text becomes
//     alt="Hi {{ contact.FIRSTNAME | default: &quot;there&quot; }}"
// personalize.ts decodes those few entities back inside {{ }} / {% %} before
// Liquid reads the template, so the tag works exactly as the author typed it.
// Contact values are never part of the template, so they can't inject HTML
// or merge tags (Liquid escapes them on output).

export type RenderOptions = {
  /** The grey preview line shown after the subject in the inbox. */
  preheader?: string;
  /** Used as the HTML <title> (some apps show it in the browser view). */
  subject?: string;
};

export type RenderResult = {
  html: string;
  text: string;
  /** Problems to show the user (no unsubscribe link, images without alt text…). */
  warnings: string[];
  /** MJML's own complaints. Should be empty; useful when debugging. */
  mjmlErrors: string[];
};

/** Thrown when the design doesn't match the EmailDocument format. */
export class InvalidDocumentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidDocumentError";
  }
}

/** Renders a design to HTML + plain text. Throws InvalidDocumentError for bad input. */
export async function renderDocument(doc: EmailDocument, opts: RenderOptions = {}): Promise<RenderResult> {
  const parsed = emailDocumentSchema.safeParse(doc);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const where = issue?.path.length ? ` (at ${issue.path.join(".")})` : "";
    throw new InvalidDocumentError(`This email design isn't valid: ${issue?.message ?? "unknown problem"}${where}`);
  }
  const valid = parsed.data;

  const source = documentToMjml(valid, opts);
  const result = await mjml2html(source, {
    validationLevel: "soft",
    minify: false,
    beautify: false,
    keepComments: false,
    // No web fonts: we only use web-safe fonts, and MJML would otherwise add
    // a Google Fonts <link> whenever a font name matches.
    fonts: {},
    // Never read files from disk, whatever the markup says.
    ignoreIncludes: true,
  });

  return {
    html: result.html,
    text: documentToPlainText(valid),
    warnings: documentWarnings(valid),
    mjmlErrors: (result.errors ?? []).map((e) => e.formattedMessage ?? e.message),
  };
}

// ── Escaping helpers ─────────────────────────────────────────────────────────
// We always write attributes in double quotes, so these four characters are
// enough. Single quotes are left alone on purpose: font names like
// 'Trebuchet MS' must stay readable inside CSS.

function escapeAttr(value: string | number): string {
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function escapeText(value: string): string {
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Builds ` name="value"` pairs, skipping null/undefined/"" values. */
function attrs(values: Record<string, string | number | null | undefined | false>): string {
  return Object.entries(values)
    .filter(([, v]) => v !== null && v !== undefined && v !== "" && v !== false)
    .map(([k, v]) => ` ${k}="${escapeAttr(v as string | number)}"`)
    .join("");
}

const px = (n: number) => `${n}px`;
const padding = (p: Padding) => `${p.top}px ${p.right}px ${p.bottom}px ${p.left}px`;

// ── URLs ─────────────────────────────────────────────────────────────────────

/** The app's public address, so email apps can download our /media/ images. */
function appUrl(): string {
  const url = process.env.APP_URL || process.env.BETTER_AUTH_URL || "http://localhost:3000";
  return url.replace(/\/+$/, "");
}

/**
 * Image address ready for an email: /media/<id> gets the app's address in
 * front. Quotes, brackets and spaces are percent-encoded so the URL is also
 * safe inside CSS url('…') (section backgrounds) and VML for Outlook.
 */
function imageUrl(src: string | null | undefined): string | null {
  const v = (src ?? "").trim();
  if (!v || !isSafeImageSrc(v)) return null;
  const full = v.startsWith("/media/") ? appUrl() + v : v;
  return full.replace(/['"()\\\s<>]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0"));
}

/**
 * A link address, or null for "no link". A link that is a whole merge tag
 * (e.g. {{ contact.WEBSITE }}) gets the `safe_url` filter, because the value
 * comes from contact data at send time: "javascript:…" there becomes "#".
 */
function linkUrl(href: string): string | null {
  const v = href.trim();
  if (!v || v === "https://" || v === "http://" || !isSafeLink(v)) return null;
  return withSafeUrlFilter(v);
}

/** Same as linkUrl, for href="{{ tag }}" inside already-sanitized rich text. */
function addSafeUrlFilters(html: string): string {
  return html.replace(/href="(\{\{\s*[a-z_][a-z0-9_.]*\s*\}\})"/gi, (_m, tag: string) => `href="${withSafeUrlFilter(tag)}"`);
}

/** /media/<id> images inside custom HTML also need the app's address. */
function absolutizeMedia(html: string): string {
  return html.replace(/\ssrc="\/media\//g, ` src="${escapeAttr(appUrl())}/media/`);
}

// ── Rich text styling ────────────────────────────────────────────────────────

/**
 * Adds inline styles to sanitized rich text, because many email apps ignore
 * <style> blocks:
 *  - paragraphs/lists get a 1em gap below, except the last one in the block
 *    (so block padding alone controls the space around it),
 *  - a <p> inside a list item gets no margin,
 *  - links get the link colour and an underline.
 * Input is sanitize-html output (normalised, these tags have no attributes
 * except <a>), so a small tag scanner is reliable here.
 */
function styleRichText(html: string, linkStyle: string): string {
  const pieces: string[] = [];
  const stack: string[] = [];
  let lastTopBlock = -1; // index in `pieces` of the last top-level <p>/<ul>/<ol>

  for (const m of html.matchAll(/<(\/?)([a-z][a-z0-9]*)([^>]*)>|[^<]+/g)) {
    const [whole, closing, name, rest] = m;
    if (!name) {
      pieces.push(whole);
      continue;
    }
    if (closing) {
      const i = stack.lastIndexOf(name);
      if (i !== -1) stack.length = i;
      pieces.push(whole);
      continue;
    }
    const parent = stack.at(-1);
    const nested = stack.includes("ul") || stack.includes("ol");
    const selfClosing = /\/\s*$/.test(rest) || name === "br";
    if (name === "p") {
      pieces.push(`<p style="${parent === "li" ? "margin:0" : "margin:0 0 1em 0"}">`);
    } else if (name === "ul" || name === "ol") {
      pieces.push(`<${name} style="${nested ? "margin:0" : "margin:0 0 1em 0"};padding:0 0 0 24px">`);
    } else if (name === "li") {
      pieces.push(`<li style="margin:0 0 4px 0">`);
    } else if (name === "a") {
      pieces.push(`<a${rest} style="${linkStyle}">`);
    } else {
      pieces.push(whole);
    }
    if (stack.length === 0 && (name === "p" || name === "ul" || name === "ol")) lastTopBlock = pieces.length - 1;
    if (!selfClosing) stack.push(name);
  }

  if (lastTopBlock !== -1) pieces[lastTopBlock] = pieces[lastTopBlock].replace("margin:0 0 1em 0", "margin:0");
  return pieces.join("");
}

// ── Document → MJML ──────────────────────────────────────────────────────────

/**
 * Invisible filler after the preheader. Without it, Gmail and Apple Mail
 * fill the rest of the preview line with the start of the email body.
 */
const PREHEADER_FILLER = "&#847;&zwnj;&nbsp;".repeat(60);

function documentToMjml(doc: EmailDocument, opts: RenderOptions): string {
  const s = doc.settings;
  const head = [
    // MJML also copies the title into an aria-label="…" attribute, so quotes
    // must be escaped too (escapeAttr), not just < > &.
    `<mj-title>${escapeAttr(opts.subject ?? "")}</mj-title>`,
    opts.preheader?.trim() ? `<mj-preview>${escapeText(opts.preheader.trim())}${PREHEADER_FILLER}</mj-preview>` : "",
    `<mj-attributes>`,
    `<mj-all${attrs({ "font-family": s.fontFamily })} />`,
    `<mj-text${attrs({ color: s.textColor, "font-size": "16px", "line-height": "1.5", padding: "0" })} />`,
    `<mj-section${attrs({ padding: "0" })} />`,
    `<mj-column${attrs({ padding: "0" })} />`,
    `</mj-attributes>`,
    // A fallback link colour for the apps that read <style>. Everything
    // essential is ALSO written inline, because some apps ignore <style>.
    `<mj-style>a { color: ${s.linkColor}; }</mj-style>`,
  ].join("\n");

  const body = doc.sections.map((section) => sectionToMjml(section, s)).join("\n");

  return [
    `<mjml lang="en">`,
    `<mj-head>`,
    head,
    `</mj-head>`,
    `<mj-body${attrs({ width: px(s.contentWidth), "background-color": s.backgroundColor })}>`,
    body,
    `</mj-body>`,
    `</mjml>`,
  ].join("\n");
}

function sectionToMjml(section: Section, s: DocumentSettings): string {
  const bg = imageUrl(section.backgroundImage);
  const sectionAttrs = attrs({
    "background-color": section.backgroundColor ?? s.contentBackgroundColor,
    "background-url": bg,
    "background-size": bg ? "cover" : null,
    "background-repeat": bg ? "no-repeat" : null,
    "background-position": bg ? "center center" : null,
    padding: padding(section.padding),
  });
  const columns = section.columns.map((c) => columnToMjml(c, s)).join("\n");
  // mj-group keeps columns side by side on phones too.
  const inner = section.stackOnMobile ? columns : `<mj-group>\n${columns}\n</mj-group>`;
  return `<mj-section${sectionAttrs}>\n${inner}\n</mj-section>`;
}

function columnToMjml(column: Column, s: DocumentSettings): string {
  const columnAttrs = attrs({
    // MJML wants a plain number; round so 33.333…% stays tidy.
    width: `${Math.round(column.widthPercent * 100) / 100}%`,
    "background-color": column.backgroundColor,
    padding: padding(column.padding),
    "vertical-align": column.verticalAlign,
  });
  const blocks = column.blocks.map((b) => blockToMjml(b, s)).filter(Boolean).join("\n");
  return `<mj-column${columnAttrs}>\n${blocks}\n</mj-column>`;
}

const HEADING_LINE_HEIGHT = "1.25";

function blockToMjml(block: Block, s: DocumentSettings): string {
  const pad = padding(block.padding);
  const linkStyle = `color:${s.linkColor};text-decoration:underline`;

  switch (block.type) {
    case "heading": {
      const color = block.color ?? s.headingColor;
      const tag = `h${block.level}`;
      const html = styleRichText(addSafeUrlFilters(sanitizeRichText(block.html, { inline: true })), linkStyle);
      const style =
        `margin:0;font-family:${s.fontFamily};font-size:${px(block.fontSize)};` +
        `line-height:${HEADING_LINE_HEIGHT};font-weight:bold;color:${color}`;
      return (
        `<mj-text${attrs({ align: block.align, color, "font-size": px(block.fontSize), "line-height": HEADING_LINE_HEIGHT, padding: pad })}>` +
        `<${tag}${attrs({ style })}>${html}</${tag}></mj-text>`
      );
    }

    case "text": {
      const color = block.color ?? s.textColor;
      const html = styleRichText(addSafeUrlFilters(sanitizeRichText(block.html)), linkStyle);
      return (
        `<mj-text${attrs({ align: block.align, color, "font-size": px(block.fontSize), "line-height": String(block.lineHeight), padding: pad })}>` +
        `${html}</mj-text>`
      );
    }

    case "footer": {
      // Footer links (like "Unsubscribe") use the footer's own quiet colour.
      const color = block.color ?? s.textColor;
      const html = styleRichText(addSafeUrlFilters(sanitizeRichText(block.html)), `color:${color};text-decoration:underline`);
      return (
        `<mj-text${attrs({ align: block.align, color, "font-size": px(block.fontSize), "line-height": "1.5", padding: pad })}>` +
        `${html}</mj-text>`
      );
    }

    case "image": {
      const src = imageUrl(block.src);
      if (!src) return placeholderBox("Image", block.width, block.align, pad);
      return (
        `<mj-image${attrs({
          src,
          alt: block.alt,
          href: linkUrl(block.href),
          rel: linkUrl(block.href) ? "noopener" : null,
          width: block.width ? px(block.width) : null,
          align: block.align,
          "border-radius": block.borderRadius ? px(block.borderRadius) : null,
          padding: pad,
        })} />`
      );
    }

    case "button": {
      const href = linkUrl(block.href);
      return (
        `<mj-button${attrs({
          href,
          rel: href ? "noopener" : null,
          align: block.align,
          "background-color": block.backgroundColor,
          color: block.textColor,
          "border-radius": px(block.borderRadius),
          "font-size": px(block.fontSize),
          "font-weight": "bold",
          "line-height": "1.2",
          "inner-padding": "12px 24px",
          width: block.fullWidth ? "100%" : null,
          padding: pad,
        })}>${escapeText(block.label)}</mj-button>`
      );
    }

    case "divider":
      return (
        `<mj-divider${attrs({
          "border-color": block.color,
          "border-style": block.style,
          "border-width": px(block.thickness),
          width: `${block.widthPercent}%`,
          align: "center",
          padding: pad,
        })} />`
      );

    case "spacer":
      return `<mj-spacer${attrs({ height: px(block.height), padding: pad })} />`;

    case "social": {
      const elements = block.links
        .map((l) => ({ ...l, href: linkUrl(l.url) }))
        .filter((l) => l.href)
        .map((l) => {
          const icon = SOCIAL_ICONS[l.network];
          return (
            `<mj-social-element${attrs({
              src: icon.src,
              "background-color": icon.background,
              href: l.href,
              rel: "noopener",
              alt: icon.label,
              title: icon.label,
              "border-radius": "4px",
            })}></mj-social-element>`
          );
        });
      if (elements.length === 0) return "";
      return (
        `<mj-social${attrs({ align: block.align, mode: "horizontal", "icon-size": px(block.iconSize), "inner-padding": "4px", padding: pad })}>` +
        `${elements.join("")}</mj-social>`
      );
    }

    case "video": {
      // Email apps can't play video: show the thumbnail, linked to the video,
      // with a "▶ Watch" caption underneath as the play hint.
      const href = linkUrl(block.href);
      const label = block.alt.trim() || "Watch the video";
      const src = imageUrl(block.thumbnailSrc);
      const above = { ...block.padding, bottom: 8 };
      const below = { ...block.padding, top: 0 };
      const picture = src
        ? `<mj-image${attrs({ src, alt: label, href, rel: href ? "noopener" : null, align: block.align, padding: padding(above) })} />`
        : placeholderBox("Video", null, block.align, padding(above));
      // "&#9654;&#xFE0E;" is ▶ drawn as text (not as a colour emoji on iPhones).
      const caption = href
        ? `<a${attrs({ href, target: "_blank", rel: "noopener", style: `color:${s.linkColor};text-decoration:none;font-weight:bold` })}>&#9654;&#xFE0E; ${escapeText(label)}</a>`
        : `&#9654;&#xFE0E; ${escapeText(label)}`;
      return `${picture}\n<mj-text${attrs({ align: block.align, "font-size": "14px", padding: padding(below) })}>${caption}</mj-text>`;
    }

    case "html": {
      const html = absolutizeMedia(addSafeUrlFilters(sanitizeCustomHtml(block.html)));
      return `<mj-text${attrs({ padding: pad })}>${html}</mj-text>`;
    }
  }
}

/** A light grey box with a word in it, shown where a picture is still missing. */
function placeholderBox(label: string, width: number | null, align: "left" | "center" | "right", pad: string): string {
  const w = width ? `width:${width}px;max-width:100%;` : "width:100%;";
  const margin = align === "center" ? "margin:0 auto;" : align === "right" ? "margin:0 0 0 auto;" : "";
  const box =
    `<div style="${w}${margin}height:160px;line-height:160px;background-color:#e4e4e7;color:#71717a;` +
    `font-size:14px;text-align:center;border-radius:4px">${escapeText(label)}</div>`;
  return `<mj-text${attrs({ padding: pad, align })}>${box}</mj-text>`;
}

// ── Social icons ─────────────────────────────────────────────────────────────
// MJML's own icon set (white symbols hosted by Mailjet) for every network it
// has. It has no WhatsApp icon, so that one is Mailchimp's white symbol on
// WhatsApp green: same look. We pass `src` ourselves (no MJML `name`), so
// MJML never wraps our links in "share this" URLs.

const MJ_ICONS = "https://www.mailjet.com/images/theme/v1/icons/ico-social/";

const SOCIAL_ICONS: Record<SocialNetwork, { src: string; background: string; label: string }> = {
  facebook: { src: `${MJ_ICONS}facebook.png`, background: "#3b5998", label: "Facebook" },
  instagram: { src: `${MJ_ICONS}instagram.png`, background: "#3f729b", label: "Instagram" },
  x: { src: `${MJ_ICONS}twitter-x.png`, background: "#000000", label: "X" },
  linkedin: { src: `${MJ_ICONS}linkedin.png`, background: "#0077b5", label: "LinkedIn" },
  youtube: { src: `${MJ_ICONS}youtube.png`, background: "#eb3323", label: "YouTube" },
  tiktok: { src: `${MJ_ICONS}tiktok.png`, background: "#000000", label: "TikTok" },
  pinterest: { src: `${MJ_ICONS}pinterest.png`, background: "#bd081c", label: "Pinterest" },
  whatsapp: {
    src: "https://cdn-images.mailchimp.com/icons/social-block-v2/light-whatsapp-96.png",
    background: "#25d366",
    label: "WhatsApp",
  },
  website: { src: `${MJ_ICONS}web.png`, background: "#4bade9", label: "Website" },
};
