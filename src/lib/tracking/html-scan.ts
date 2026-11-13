// A small, careful HTML scanner for the <a> tags of an email. Pure functions
// (no database, no server-only code), so it can be shared by click tracking
// (links.ts) and UTM tags (utm.ts), and tested on its own.
//
// Why not a regular expression over the whole email? Because of the cases
// that break simple patterns: a ">" inside a quoted attribute, <style>
// blocks, ordinary comments (whose links are NOT live) and MJML's Outlook
// conditional comments <!--[if mso]> … <![endif]--> (whose content IS live
// in Outlook). This walks the HTML once, from left to right.

/** Elements whose content is text, not tags. */
const RAW_TEXT_ELEMENTS = new Set(["style", "script", "title", "textarea", "xmp"]);

/**
 * Calls `rewrite` with every opening <a …> tag (in order). It returns the new
 * tag text, or null to keep it. Everything else is copied unchanged.
 */
export function mapAnchorTags(html: string, rewrite: (tag: string) => string | null): string {
  let out = "";
  let copied = 0; // html[0 … copied) is already in `out`
  let i = 0;
  while (i < html.length) {
    const lt = html.indexOf("<", i);
    if (lt === -1) break;

    if (html.startsWith("<!--", lt)) {
      const conditional = /^<!--\s*\[if\b[^\]]*\]>/i.exec(html.slice(lt, lt + 200));
      if (conditional) {
        // <!--[if mso | IE]> … : Outlook renders what follows, so keep scanning inside.
        i = lt + conditional[0].length;
      } else {
        // A real comment: skip it. (Searching from lt + 2 also ends "<!-->" correctly.)
        const end = html.indexOf("-->", lt + 2);
        i = end === -1 ? html.length : end + 3;
      }
      continue;
    }
    if (html[lt + 1] === "!" || html[lt + 1] === "?") {
      // <!DOCTYPE …>, <![endif]-->, <?xml …?>
      const end = html.indexOf(">", lt);
      i = end === -1 ? html.length : end + 1;
      continue;
    }

    const name = /^<(\/?)([a-zA-Z][^\s/>]*)/.exec(html.slice(lt, lt + 64));
    if (!name) {
      i = lt + 1; // a lone "<" in text
      continue;
    }
    const end = findTagEnd(html, lt);
    if (end === -1) break; // unfinished tag at the very end: leave it alone
    const closing = name[1] === "/";
    const tagName = name[2].toLowerCase();

    if (!closing && tagName === "a") {
      const tag = html.slice(lt, end + 1);
      const replaced = rewrite(tag);
      if (replaced !== null) {
        out += html.slice(copied, lt) + replaced;
        copied = end + 1;
      }
    }
    i = end + 1;

    if (!closing && RAW_TEXT_ELEMENTS.has(tagName)) {
      // Skip to </style> etc.: CSS like "#outlook a {…}" isn't markup.
      const close = new RegExp(`</${tagName}[\\s>/]`, "i").exec(html.slice(i));
      i = close ? i + close.index : html.length;
    }
  }
  return out + html.slice(copied);
}

/**
 * Index of the ">" that ends the tag starting at `start`, or -1. A ">" inside
 * a quoted attribute value doesn't count. Quotes only start a value right
 * after "=" (as in browsers), so an apostrophe elsewhere can't confuse it.
 */
function findTagEnd(html: string, start: number): number {
  let quote: string | null = null;
  let lastNonSpace = "";
  for (let k = start + 1; k < html.length; k++) {
    const c = html[k];
    if (quote) {
      if (c === quote) {
        quote = null;
        lastNonSpace = c;
      }
      continue;
    }
    if (c === ">") return k;
    if ((c === '"' || c === "'") && lastNonSpace === "=") quote = c;
    else if (!/\s/.test(c)) lastNonSpace = c;
  }
  return -1;
}

export type Attribute = {
  /** Lowercased name. */
  name: string;
  /** The raw value (entities not decoded), or null for a bare attribute. */
  value: string | null;
  /** The quote around the value: '"', "'" or "" (unquoted / bare). */
  quote: string;
  /** Where the whole attribute (name="value") starts and ends in the tag. */
  start: number;
  end: number;
};

/** The attributes of one tag like <a HREF='x' target=_blank data-x>. */
export function parseAttributes(tag: string): Attribute[] {
  const attrs: Attribute[] = [];
  const nameEnd = /^<[^\s/>]*/.exec(tag)![0].length;
  let k = nameEnd;
  const isSpace = (c: string | undefined) => c !== undefined && /\s/.test(c);
  while (k < tag.length) {
    while (isSpace(tag[k]) || tag[k] === "/") k++;
    if (k >= tag.length || tag[k] === ">") break;

    const start = k;
    while (k < tag.length && !isSpace(tag[k]) && tag[k] !== "=" && tag[k] !== ">" && !(tag[k] === "/" && tag[k + 1] === ">")) k++;
    const name = tag.slice(start, k).toLowerCase();
    if (k === start) {
      k++; // a stray character; move on
      continue;
    }

    let j = k;
    while (isSpace(tag[j])) j++;
    if (tag[j] !== "=") {
      attrs.push({ name, value: null, quote: "", start, end: k });
      continue;
    }
    j++;
    while (isSpace(tag[j])) j++;
    let value: string;
    const q = tag[j];
    if (q === '"' || q === "'") {
      const close = tag.indexOf(q, j + 1);
      const valueEnd = close === -1 ? tag.length - 1 : close;
      value = tag.slice(j + 1, valueEnd);
      k = close === -1 ? valueEnd : close + 1;
      attrs.push({ name, value, quote: q, start, end: k });
    } else {
      let e = j;
      while (e < tag.length && !isSpace(tag[e]) && tag[e] !== ">") e++;
      value = tag.slice(j, e);
      k = e;
      attrs.push({ name, value, quote: "", start, end: k });
    }
  }
  return attrs;
}

// ── Entities ─────────────────────────────────────────────────────────────────

const NAMED_ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

/** "&amp;" → "&", "&#39;" → "'", … (the entities our renderer and editors produce). */
export function decodeEntities(s: string): string {
  return s.replace(/&(#\d{1,7}|#x[0-9a-f]{1,6}|[a-z]{2,8});/gi, (whole, ref: string) => {
    if (ref[0] !== "#") return NAMED_ENTITIES[ref.toLowerCase()] ?? whole;
    const code = ref[1] === "x" || ref[1] === "X" ? parseInt(ref.slice(2), 16) : parseInt(ref.slice(1), 10);
    const valid = code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff);
    return valid ? String.fromCodePoint(code) : whole;
  });
}

/** Makes text safe inside a double-quoted attribute value. */
export function escapeAttribute(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
