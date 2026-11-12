// Cleans HTML that came from users before it goes into an email.
//
//  - sanitizeRichText:   the editor's small rich-text subset (heading, text,
//                        footer blocks). Anything else is removed.
//  - sanitizeCustomHtml: the "HTML" block for advanced users. A broad set of
//                        email-safe tags, but never scripts, forms, frames or
//                        event handlers.
//
// Safe to import from server AND client (no server-only imports), so the
// editor can also clean pasted content in the browser. We never use
// sanitize-html's CSS parser (postcss), which only works well in Node;
// styles are cleaned by the small functions below instead.
import sanitizeHtml from "sanitize-html";

// ── Links ────────────────────────────────────────────────────────────────────

/** A whole merge tag such as {{ unsubscribe_url }} (same rule as linkSchema). */
const WHOLE_MERGE_TAG = /^\{\{\s*[a-z_][a-z0-9_.]*\s*\}\}$/i;

/**
 * True for links a reader may click: https://, http://, mailto:, tel: or a
 * whole merge tag. Same rule as `linkSchema` in document.ts, so a link that
 * was valid when saved is still valid when rendered.
 */
export function isSafeLink(href: string): boolean {
  const v = href.trim();
  if (v === "" || v.length > 2000) return false;
  if (WHOLE_MERGE_TAG.test(v)) return true;
  // Control characters (tabs, newlines…) are a classic way to sneak
  // "java\tscript:" past filters. Real links never contain them.
  if (/[\u0000-\u001f\u007f]/.test(v)) return false;
  // Merge tags may sit INSIDE a link, e.g. https://shop.example/?e={{ contact.EMAIL }}.
  // Their spaces are fine, so check the link with the tags taken out: the rest
  // must have no whitespace and must start with a safe scheme.
  const withoutTags = v.replace(/\{\{[^{}]*\}\}/g, "x");
  if (/\s/.test(withoutTags)) return false;
  return /^(https?:\/\/|mailto:|tel:)/i.test(withoutTags);
}

/** Tags whose value WE create (never contact data), so they need no URL check. */
const TRUSTED_URL_TAGS = new Set(["unsubscribe_url"]);

/**
 * A link that is a whole merge tag, e.g. {{ contact.WEBSITE }}, gets our
 * `safe_url` filter (see personalize.ts), because its value comes from
 * contact data at send time: "javascript:…" there becomes "#".
 * Other links are returned unchanged.
 */
export function withSafeUrlFilter(href: string): string {
  const m = /^\{\{\s*([a-z_][a-z0-9_.]*)\s*\}\}$/i.exec(href.trim());
  if (!m || TRUSTED_URL_TAGS.has(m[1])) return href;
  return `{{ ${m[1]} | safe_url }}`;
}

/** Image sources: http(s) addresses, or our own /media/<id> files. Never data: URLs. */
export function isSafeImageSrc(src: string): boolean {
  const v = src.trim();
  // Quotes and spaces are fine here: they are escaped/percent-encoded on output.
  if (v === "" || v.length > 2000 || /[\u0000-\u001f\u007f]/.test(v)) return false;
  return /^https?:\/\//i.test(v) || /^\/media\/[A-Za-z0-9_-]+/.test(v);
}

/** Every link opens in a new tab and can't control the page that opened it. */
function linkAttributes(href: string): Record<string, string> {
  return { href: href.trim(), target: "_blank", rel: "noopener" };
}

// ── Styles ───────────────────────────────────────────────────────────────────

const HEX_COLOR = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

/** Splits "a: b; c: d" into [["a","b"],["c","d"]] (lower-cased property names). */
function parseDeclarations(style: string): [string, string][] {
  const out: [string, string][] = [];
  for (const part of style.split(";")) {
    const i = part.indexOf(":");
    if (i <= 0) continue;
    const prop = part.slice(0, i).trim().toLowerCase();
    const value = part.slice(i + 1).trim();
    if (prop && value) out.push([prop, value]);
  }
  return out;
}

/** Rich text: a <span> may only change the text colour, as a #hex value. */
function richTextSpanStyle(style: string | undefined): string | null {
  if (!style) return null;
  let color: string | null = null;
  for (const [prop, value] of parseDeclarations(style)) {
    if (prop === "color" && HEX_COLOR.test(value)) color = value.toLowerCase();
  }
  return color ? `color:${color}` : null;
}

/** CSS properties that can run code or load things in old browsers/clients. */
const BLOCKED_CSS_PROPERTIES = new Set(["behavior", "-moz-binding", "-ms-behavior", "binding"]);

/**
 * Custom HTML: keeps ordinary inline styles but drops any declaration that
 * could run script, load a non-web URL or hide its meaning behind escapes.
 * Returns null when nothing is left.
 */
export function cleanInlineStyle(style: string | undefined): string | null {
  if (!style) return null;
  const kept: string[] = [];
  for (const [prop, value] of parseDeclarations(style)) {
    if (!/^-?[a-z][a-z-]*$/.test(prop) || BLOCKED_CSS_PROPERTIES.has(prop)) continue;
    const v = value.toLowerCase();
    // Backslash escapes and comments are how "expression(" gets disguised.
    if (/[\\<>]|\/\*|expression\s*\(|javascript:|vbscript:|@import/.test(v)) continue;
    // url(...) is fine only for plain web addresses (e.g. background images).
    const urls = [...v.matchAll(/url\s*\(\s*(['"]?)(.*?)\1\s*\)/g)];
    if (/url\s*\(/.test(v) && (urls.length === 0 || urls.some((m) => !/^https?:\/\//.test(m[2])))) continue;
    kept.push(`${prop}:${value}`);
  }
  return kept.length ? kept.join(";") : null;
}

/** NUL characters are never real content and confuse some parsers. */
function stripNul(html: string): string {
  return String(html ?? "").replace(/\u0000/g, "");
}

// ── Shared options ───────────────────────────────────────────────────────────

/**
 * Tags whose CONTENT must go too when the tag is removed (not just the tag):
 * scripts, styles, document heads, frames and form widgets.
 */
const DROP_WITH_CONTENT = [
  "script", "style", "textarea", "option", "select", "xmp", "noscript", "noembed", "noframes",
  "template", "title", "head", "iframe", "object", "embed", "applet", "svg", "math",
];

const BASE_OPTIONS: sanitizeHtml.IOptions = {
  disallowedTagsMode: "discard",
  nonTextTags: DROP_WITH_CONTENT,
  allowedSchemes: ["http", "https", "mailto", "tel"],
  allowedSchemesByTag: { img: ["http", "https"] },
  allowProtocolRelative: false,
  // We clean styles ourselves (see above), so sanitize-html's postcss-based
  // parser is switched off. That also keeps this file browser-friendly.
  parseStyleAttributes: false,
  // Very deep nesting is never real content, only an attempt to slow us down.
  nestingLimit: 60,
};

// ── Rich text ────────────────────────────────────────────────────────────────

const INLINE_TAGS = ["br", "strong", "b", "em", "i", "u", "s", "a", "span"];
const BLOCK_TAGS = ["p", "ul", "ol", "li"];

/**
 * Cleans the editor's rich text. Allowed: <p> <br> <strong> <b> <em> <i> <u>
 * <s> <a href> <ul> <ol> <li> <span style="color:#hex">.
 *
 * `inline: true` (headings) also removes paragraphs and lists, turning
 * paragraph/list-item breaks into <br /> so the words don't run together.
 */
export function sanitizeRichText(html: string, opts: { inline?: boolean } = {}): string {
  const clean = sanitizeHtml(stripNul(html), {
    ...BASE_OPTIONS,
    allowedTags: [...INLINE_TAGS, ...BLOCK_TAGS],
    allowedAttributes: { a: ["href", "target", "rel"], span: ["style"] },
    transformTags: {
      // A link with a bad or missing address becomes plain text (a <span>).
      a: (_tag, attribs) =>
        attribs.href && isSafeLink(attribs.href)
          ? { tagName: "a", attribs: linkAttributes(attribs.href) }
          : { tagName: "span", attribs: {} },
      span: (_tag, attribs) => {
        const style = richTextSpanStyle(attribs.style);
        const clean: Record<string, string> = style ? { style } : {};
        return { tagName: "span", attribs: clean };
      },
      // Pasted headings/divs keep their line breaks as plain paragraphs.
      ...Object.fromEntries(
        ["h1", "h2", "h3", "h4", "h5", "h6", "div", "blockquote"].map((t) => [t, () => ({ tagName: "p", attribs: {} })]),
      ),
    },
  });
  return opts.inline ? flattenBlocks(clean) : clean;
}

/**
 * "<p>One</p><ul><li>Two</li></ul>" → "One<br />Two". Runs on sanitize-html's
 * own output, which is normalised (lower-case tags, no attributes on these
 * tags), so simple patterns are enough here.
 */
function flattenBlocks(html: string): string {
  const BREAK = "\u0000"; // a placeholder that can't appear in sanitized HTML
  return html
    .replace(/(?:<\/(?:p|li|ul|ol)>)+/g, BREAK)
    .replace(/<(?:p|li|ul|ol)>/g, "")
    .replace(/^\u0000+|\u0000+$/g, "")
    .replace(/\u0000+/g, "<br />");
}

// ── Custom HTML block ────────────────────────────────────────────────────────

const CUSTOM_TAGS = [
  "a", "abbr", "address", "b", "big", "blockquote", "br", "caption", "center", "cite", "code",
  "col", "colgroup", "dd", "del", "div", "dl", "dt", "em", "figcaption", "figure", "font",
  "h1", "h2", "h3", "h4", "h5", "h6", "hr", "i", "img", "ins", "kbd", "li", "mark", "ol", "p",
  "pre", "q", "s", "small", "span", "strike", "strong", "sub", "sup", "table", "tbody", "td",
  "tfoot", "th", "thead", "tr", "u", "ul",
];

const COMMON_ATTRIBUTES = [
  "style", "class", "align", "valign", "width", "height", "bgcolor", "dir", "lang", "title", "role",
];

/**
 * Cleans an HTML block written by an advanced user.
 *
 * Removed: <script>, <style>, <iframe>, <object>, <embed>, <form> and every
 * form control, <meta>, <base>, <link>, <svg>, event handlers (on*), and any
 * javascript:/vbscript:/data: URL.
 *
 * Choice on data: URLs: they are refused everywhere, images included. Gmail
 * and Outlook block data: images anyway, they bloat the email (Gmail clips
 * messages over ~102 KB) and data:image/svg+xml can carry script. Upload
 * images to the media library instead.
 */
export function sanitizeCustomHtml(html: string): string {
  return sanitizeHtml(stripNul(html), {
    ...BASE_OPTIONS,
    allowedTags: CUSTOM_TAGS,
    allowedAttributes: {
      "*": COMMON_ATTRIBUTES,
      a: ["href", "target", "rel", "name"],
      img: ["src", "alt", "border"],
      table: ["border", "cellpadding", "cellspacing"],
      td: ["colspan", "rowspan"],
      th: ["colspan", "rowspan", "scope"],
      col: ["span"],
      colgroup: ["span"],
      font: ["color", "face", "size"],
      ol: ["start", "type"],
      ul: ["type"],
    },
    transformTags: {
      "*": (tag, attribs) => {
        // Inline styles are cleaned declaration by declaration.
        if ("style" in attribs) {
          const style = cleanInlineStyle(attribs.style);
          if (style) attribs.style = style;
          else delete attribs.style;
        }
        return { tagName: tag, attribs };
      },
      a: (_tag, attribs) => {
        // A link with a bad address keeps its text but loses the address.
        const { href, ...rest } = attribs;
        delete rest.target;
        delete rest.rel;
        return { tagName: "a", attribs: href && isSafeLink(href) ? { ...rest, ...linkAttributes(href) } : rest };
      },
      img: (_tag, attribs) => {
        // An image without a safe source would only show as broken: drop it
        // (see exclusiveFilter below).
        const src = attribs.src && isSafeImageSrc(attribs.src) ? attribs.src.trim() : "";
        return { tagName: "img", attribs: { ...attribs, src } };
      },
    },
    exclusiveFilter: (frame) => frame.tag === "img" && !frame.attribs.src,
  });
}
