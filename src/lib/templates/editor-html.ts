// Keeps the editor's rich text inside the small HTML subset that document.ts
// allows:  <p> <br> <strong> <b> <em> <i> <u> <s> <a href> <ul> <ol> <li>
//          <span style="color:#hex">
//
// Used in the BROWSER by the editor:
//   - on every change coming out of the text editor (TipTap), and
//   - before showing stored HTML on the canvas (a document saved by someone
//     else, or a starter template, is never trusted).
// The server renderer sanitizes again (sanitize.ts), so this is a second wall.
//
// It uses the browser's DOMParser, which builds an INERT document: scripts
// don't run and images don't load while we read it. Without a DOM (server)
// the functions fall back to plain, escaped text.
import { linkSchema } from "@/lib/templates/document";

/**
 * "inline":  headings (no paragraphs or lists; breaks become <br>)
 * "noLists": footer (paragraphs, no lists)
 * "full":    text blocks (everything in the subset)
 */
export type RichTextMode = "inline" | "noLists" | "full";

const escapeText = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const escapeAttr = (s: string) => escapeText(s).replace(/"/g, "&quot;");

const MARKS: Record<string, string> = { strong: "strong", b: "strong", em: "em", i: "em", u: "u", s: "s", strike: "s", del: "s" };
const BLOCKS = new Set(["p", "div", "h1", "h2", "h3", "h4", "h5", "h6", "blockquote", "pre"]);
const DROP_WITH_CONTENT = new Set(["script", "style", "template", "head", "title", "iframe", "object", "embed", "svg", "math", "noscript", "textarea", "select"]);

/** "#abc", "#aabbcc" or "rgb(1, 2, 3)" → "#aabbcc". Anything else → null. */
export function toHexColor(value: string | null | undefined): string | null {
  if (!value) return null;
  const v = value.trim().toLowerCase();
  if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/.test(v)) {
    return v.length === 4 ? `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}` : v;
  }
  const m = v.match(/^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(?:,\s*[\d.]+\s*)?\)$/);
  if (!m) return null;
  const hex = m.slice(1, 4).map((n) => Math.min(255, Number(n)).toString(16).padStart(2, "0"));
  return `#${hex.join("")}`;
}

/** Reads `color:` (not background-color) from a style attribute. */
function colorFromStyle(style: string | null): string | null {
  if (!style) return null;
  for (const part of style.split(";")) {
    const i = part.indexOf(":");
    if (i > 0 && part.slice(0, i).trim().toLowerCase() === "color") return toHexColor(part.slice(i + 1));
  }
  return null;
}

/** True for the link addresses our documents accept (https, http, mailto, tel or a whole merge tag). */
export function isAllowedLink(href: string): boolean {
  return href.trim() !== "" && linkSchema.safeParse(href).success;
}

/** Cleans one list of child nodes into subset HTML. */
function cleanChildren(nodes: NodeListOf<ChildNode> | ChildNode[], mode: RichTextMode): string {
  let out = "";
  for (const node of Array.from(nodes)) out += cleanNode(node, mode);
  return out;
}

function cleanNode(node: ChildNode, mode: RichTextMode): string {
  if (node.nodeType === 3) return escapeText(node.textContent ?? "");
  if (node.nodeType !== 1) return ""; // comments etc.
  const el = node as Element;
  const tag = el.tagName.toLowerCase();
  if (DROP_WITH_CONTENT.has(tag)) return "";
  const inner = () => cleanChildren(el.childNodes, mode);

  if (tag === "br") return "<br>";
  if (MARKS[tag]) {
    const content = inner();
    return content ? `<${MARKS[tag]}>${content}</${MARKS[tag]}>` : "";
  }
  if (tag === "a") {
    const href = el.getAttribute("href")?.trim() ?? "";
    const content = inner();
    // A link with a bad address keeps its words but stops being a link.
    return isAllowedLink(href) ? `<a href="${escapeAttr(href)}">${content}</a>` : content;
  }
  if (tag === "span" || tag === "font") {
    const color = tag === "font" ? toHexColor(el.getAttribute("color")) : colorFromStyle(el.getAttribute("style"));
    const content = inner();
    return color && content ? `<span style="color:${color}">${content}</span>` : content;
  }
  if (tag === "ul" || tag === "ol") {
    if (mode === "full") {
      const items = Array.from(el.children)
        .filter((c) => c.tagName.toLowerCase() === "li")
        .map((li) => `<li>${cleanInline(li, mode)}</li>`)
        .join("");
      return items ? `<${tag}>${items}</${tag}>` : "";
    }
    // No lists allowed here: each item becomes its own line.
    return Array.from(el.children)
      .map((li) => wrapBlock(cleanInline(li, mode), mode))
      .join("");
  }
  if (tag === "li") return wrapBlock(cleanInline(el, mode), mode);
  if (BLOCKS.has(tag)) return wrapBlock(inner(), mode);
  // Unknown tag (e.g. <table>, <section>): keep the text, drop the tag.
  return inner();
}

/** Content of a list item / paragraph with nested blocks flattened into <br>s. */
function cleanInline(el: Element, mode: RichTextMode): string {
  const html = cleanChildren(el.childNodes, mode);
  return html.replace(/<\/?p>/g, (m) => (m === "</p>" ? "<br>" : "")).replace(/(<br>)+$/, "");
}

function wrapBlock(content: string, mode: RichTextMode): string {
  if (mode === "inline") {
    const line = content.replace(/(<br>)+$/, "");
    return line ? `${line}<br>` : "";
  }
  // Keep empty paragraphs (they are blank lines the writer typed).
  return content === "" ? "<p></p>" : wrapLooseInline(content);
}

/**
 * Puts loose inline content (text, <strong>, <a>...) that sits next to
 * paragraphs or lists into its own <p>, and never nests a <p> in a <p>.
 * Safe to scan with a regex: the input is OUR output, whose block tags never
 * have attributes.
 */
function wrapLooseInline(html: string): string {
  let out = "";
  let loose = "";
  let depth = 0;
  let last = 0;
  const flush = () => {
    if (loose.trim() !== "") out += `<p>${loose}</p>`;
    loose = "";
  };
  const re = /<\/?(p|ul|ol)>/g;
  for (let m = re.exec(html); m; m = re.exec(html)) {
    const between = html.slice(last, m.index);
    if (depth === 0) loose += between;
    else out += between;
    const closing = m[0][1] === "/";
    if (!closing && depth === 0) flush();
    out += m[0];
    depth = Math.max(0, depth + (closing ? -1 : 1));
    last = re.lastIndex;
  }
  const rest = html.slice(last);
  if (depth === 0) loose += rest;
  else out += rest;
  flush();
  return out;
}

/** Turns any HTML into the allowed subset for the given block kind. */
export function cleanRichHtml(html: string, mode: RichTextMode): string {
  if (typeof DOMParser === "undefined") return escapeText(html.replace(/<[^>]*>/g, ""));
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html");
  const out = cleanChildren(doc.body.childNodes, mode);
  // Headings: one line of inline content. Others: every piece in a block.
  return mode === "inline" ? out.replace(/(<br>)+$/, "") : wrapLooseInline(out);
}

/** Plain text of some rich HTML (for labels and screen-reader names). */
export function richTextToPlain(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/(p|li)>/gi, " ")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}
