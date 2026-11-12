// Builds the plain-text version of an email. Every email we send has one:
// some people read mail as text only, and spam filters like seeing it.
//
// Merge tags such as {{ contact.FIRSTNAME }} are kept exactly as written;
// they are filled in per contact later (see personalize.ts), WITHOUT HTML
// escaping, because this is plain text.
import type { Block, EmailDocument, SocialNetwork } from "@/lib/templates/document";
import { sanitizeCustomHtml, withSafeUrlFilter } from "@/lib/templates/sanitize";

// ── HTML → text ──────────────────────────────────────────────────────────────

/** Decodes the few entities sanitize-html writes, plus numeric ones. */
function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (m, code: string) => {
    const c = code.toLowerCase();
    if (c === "amp") return "&";
    if (c === "lt") return "<";
    if (c === "gt") return ">";
    if (c === "quot") return '"';
    if (c === "apos") return "'";
    if (c === "nbsp") return " ";
    const n = c.startsWith("#x") ? parseInt(c.slice(2), 16) : parseInt(c.slice(1), 10);
    return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : m;
  });
}

/** Reads one attribute from a sanitized tag like ` href="…" target="_blank"`. */
function readAttribute(attrs: string, name: string): string | null {
  const m = new RegExp(`\\s${name}="([^"]*)"`, "i").exec(attrs);
  return m ? decodeEntities(m[1]) : null;
}

const PARAGRAPH_TAGS = new Set([
  "p", "div", "h1", "h2", "h3", "h4", "h5", "h6", "blockquote", "table", "pre", "figure", "address", "center",
]);

/**
 * Turns HTML into readable text:
 *   paragraphs → separated by a blank line, <br> → line break,
 *   lists → "- item" / "1. item", links → "label (url)", <hr> → "---".
 * The HTML is sanitized first, which also normalises it (quoted attributes,
 * lower-case tags), so the simple tag scanner below is reliable.
 */
export function htmlToPlainText(html: string): string {
  const clean = sanitizeCustomHtml(html);
  let out = "";
  const lists: { ordered: boolean; n: number }[] = [];
  const links: { href: string | null; start: number }[] = [];
  let atItemStart = false; // just wrote "- ", so a <p> inside the <li> mustn't break the line

  /** Makes sure the text ends with at least `count` line breaks. */
  const lineBreaks = (count: number) => {
    if (atItemStart) return;
    out = out.replace(/[ \t]+$/, "");
    if (!out) return;
    const have = /\n*$/.exec(out)![0].length;
    if (have < count) out += "\n".repeat(count - have);
  };
  const blockBreak = () => lineBreaks(lists.length ? 1 : 2);

  const tokens = /<(\/?)([a-z][a-z0-9]*)((?:\s[^>]*?)?)\s*\/?>|([^<]+)/gi;
  for (const m of clean.matchAll(tokens)) {
    const [, closing, rawName, attrs, text] = m;
    if (text !== undefined) {
      let t = decodeEntities(text).replace(/\s+/g, " ");
      if (!out || out.endsWith("\n") || out.endsWith(" ")) t = t.replace(/^ /, "");
      if (t) {
        out += t;
        atItemStart = false;
      }
      continue;
    }
    const name = rawName.toLowerCase();

    if (!closing) {
      if (name === "br") {
        out = out.replace(/[ \t]+$/, "") + "\n";
      } else if (name === "hr") {
        lineBreaks(1);
        out += "---";
        lineBreaks(1);
      } else if (name === "ul" || name === "ol") {
        blockBreak();
        lists.push({ ordered: name === "ol", n: 0 });
      } else if (name === "li") {
        lineBreaks(1);
        const list = lists.at(-1);
        const indent = "  ".repeat(Math.max(0, lists.length - 1));
        out += indent + (list?.ordered ? `${++list.n}. ` : "- ");
        atItemStart = true;
      } else if (name === "tr") {
        lineBreaks(1);
      } else if (name === "td" || name === "th") {
        if (out && !out.endsWith("\n") && !out.endsWith(" ")) out += "  ";
      } else if (name === "a") {
        links.push({ href: readAttribute(attrs, "href"), start: out.length });
      } else if (PARAGRAPH_TAGS.has(name)) {
        blockBreak();
      }
      continue;
    }

    // Closing tags
    if (name === "a") {
      const link = links.pop();
      if (!link?.href) continue;
      link.href = withSafeUrlFilter(link.href);
      const label = out.slice(link.start).trim();
      const shown = link.href.replace(/^mailto:/i, "");
      if (!label) out += link.href;
      else if (label !== link.href && label !== shown) out += ` (${link.href})`;
    } else if (name === "ul" || name === "ol") {
      lists.pop();
      atItemStart = false;
      blockBreak();
    } else if (name === "li" || name === "tr") {
      atItemStart = false;
      lineBreaks(1);
    } else if (PARAGRAPH_TAGS.has(name)) {
      blockBreak();
    }
  }
  return tidy(out);
}

/** Trims every line, and never more than one blank line in a row. */
function tidy(text: string): string {
  return text
    .split("\n")
    .map((line) => line.replace(/\s+$/, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// ── Document → text ──────────────────────────────────────────────────────────

const NETWORK_LABELS: Record<SocialNetwork, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  x: "X",
  linkedin: "LinkedIn",
  youtube: "YouTube",
  tiktok: "TikTok",
  pinterest: "Pinterest",
  whatsapp: "WhatsApp",
  website: "Website",
};

/** "" and the editor's placeholder "https://" mean "no link yet". */
function realLink(href: string): string | null {
  const v = href.trim();
  return v && v !== "https://" && v !== "http://" ? withSafeUrlFilter(v) : null;
}

/** "Welcome" → "Welcome\n=======" (h1) or "-------" (h2/h3). */
function underline(text: string, level: 1 | 2 | 3): string {
  if (!text) return "";
  const width = Math.min(70, Math.max(...text.split("\n").map((l) => l.length)));
  return `${text}\n${(level === 1 ? "=" : "-").repeat(width)}`;
}

function blockToText(block: Block): string {
  switch (block.type) {
    case "heading":
      // Underlined rather than UPPER-CASED: upper-casing would also change
      // merge tags ({{ contact.FIRSTNAME }} → {{ CONTACT.FIRSTNAME }}).
      return underline(htmlToPlainText(block.html), block.level);
    case "text":
    case "footer":
    case "html":
      return htmlToPlainText(block.html);
    case "image": {
      const href = realLink(block.href);
      if (!href) return ""; // a picture without a link has nothing to read
      return block.alt.trim() ? `${block.alt.trim()} (${href})` : href;
    }
    case "button": {
      const href = realLink(block.href);
      return href ? `${block.label}: ${href}` : block.label;
    }
    case "video": {
      const href = realLink(block.href);
      const label = block.alt.trim() || "Watch the video";
      return href ? `${label}: ${href}` : "";
    }
    case "social":
      return block.links
        .filter((l) => realLink(l.url))
        .map((l) => `${NETWORK_LABELS[l.network]}: ${realLink(l.url)}`)
        .join("\n");
    case "divider":
      return "---";
    case "spacer":
      return "";
  }
}

/** The plain-text version of a whole email design (merge tags left in place). */
export function documentToPlainText(doc: EmailDocument): string {
  const parts: string[] = [];
  for (const section of doc.sections) {
    for (const column of section.columns) {
      for (const block of column.blocks) {
        const text = blockToText(block).trim();
        // Two dividers in a row (or one at the very start) read as noise.
        if (text === "---" && (parts.length === 0 || parts.at(-1) === "---")) continue;
        if (text) parts.push(text);
      }
    }
  }
  while (parts.at(-1) === "---") parts.pop();
  return parts.join("\n\n");
}
