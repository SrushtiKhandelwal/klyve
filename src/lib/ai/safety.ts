// Helpers that keep AI answers safe to use.
//
// RULE: everything an AI writes is UNTRUSTED, exactly like text typed into a
// form by a stranger. So:
//  - plain text is cleaned (no control characters, no line breaks where a
//    single line is expected) and HTML-escaped before it goes into an email;
//  - rich text goes through the project's sanitizer (templates/sanitize.ts);
//  - the AI may never add link addresses or merge tags ({{ … }}) of its own:
//    links come from the user, and merge tags must match the original text.
//
// Safe to import from server AND client (no secrets, no database).

/** Makes text safe to put inside HTML (as text or inside an attribute). */
export function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/** Removes control characters (tabs and line breaks become spaces). */
export function stripControlChars(value: string): string {
  return value.replace(/[\u0000-\u001f\u007f]/g, " ");
}

/** One clean line of plain text: no HTML tags, no line breaks, single spaces, at most `max` characters. */
export function cleanLine(value: string, max: number): string {
  return stripControlChars(value.replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max)
    .trim();
}

/** Plain text that may have paragraphs: no HTML, at most `max` characters. */
export function cleanParagraph(value: string, max: number): string {
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/\r\n?/g, "\n")
      .replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, max)
    .trim();
}

/** True for a full http:// or https:// web address (what a button may link to). */
export function isHttpUrl(value: string): boolean {
  const v = value.trim();
  if (v.length > 2000 || /\s/.test(v)) return false;
  try {
    const url = new URL(v);
    return (url.protocol === "https:" || url.protocol === "http:") && url.hostname.includes(".");
  } catch {
    return false;
  }
}

// ── Merge tags ({{ contact.FIRSTNAME }}) ────────────────────────────────────

const MERGE_TAG = /\{\{[\s\S]*?\}\}/g;

/** Turns the few HTML entities that can appear inside a tag back into characters. */
function decodeEntities(value: string): string {
  return value
    .replace(/&(quot|#34|#x22);/gi, '"')
    .replace(/&(apos|#39|#x27);/gi, "'")
    .replace(/&(lt|#60);/gi, "<")
    .replace(/&(gt|#62);/gi, ">")
    .replace(/&(nbsp|#160);/gi, " ")
    .replace(/&amp;/gi, "&");
}

/** "{{contact.FIRSTNAME|default:&quot;x&quot;}}" and '{{ contact.FIRSTNAME | default: "x" }}' compare equal. */
export function normalizeMergeTag(tag: string): string {
  return decodeEntities(tag).replace(/\s+/g, "");
}

/** The merge tags in some text or HTML, exactly as written (in order, repeats included). */
export function findMergeTags(value: string): string[] {
  return value.match(MERGE_TAG) ?? [];
}

/**
 * Compares the merge tags of the original and the AI's version. Returns null
 * when they are the same set, else a message saying what went wrong.
 */
export function compareMergeTags(original: string, rewritten: string): string | null {
  const before = new Set(findMergeTags(original).map(normalizeMergeTag));
  const after = new Set(findMergeTags(rewritten).map(normalizeMergeTag));
  for (const tag of before) {
    if (!after.has(tag)) return "The AI dropped or changed a personalization tag, so we didn't use its answer. Please try again.";
  }
  for (const tag of after) {
    if (!before.has(tag)) return "The AI added a personalization tag of its own, so we didn't use its answer. Please try again.";
  }
  // Half-written tags ("{{ contact.NAME" without the end) are refused too.
  const leftovers = (s: string) => (s.replace(MERGE_TAG, "").match(/\{\{|\}\}/g) ?? []).length;
  if (leftovers(rewritten) > leftovers(original)) {
    return "The AI broke a personalization tag, so we didn't use its answer. Please try again.";
  }
  return null;
}

/**
 * Swaps every merge tag for a short placeholder like [[T1]], so the AI can't
 * translate or "fix" the inside of a tag. `restore` puts the exact original
 * tags back and says whether every placeholder came back (and no others).
 */
export function protectMergeTags(value: string): {
  text: string;
  restore: (rewritten: string) => { ok: true; text: string } | { ok: false; error: string };
} {
  const tags: string[] = [];
  const text = value.replace(MERGE_TAG, (tag) => {
    const index = tags.indexOf(tag);
    if (index !== -1) return `[[T${index + 1}]]`;
    tags.push(tag);
    return `[[T${tags.length}]]`;
  });

  function restore(rewritten: string) {
    // The AI must not write merge tags of its own: they come from the original only.
    if (/\{\{|\}\}/.test(rewritten)) {
      return { ok: false as const, error: "The AI added a personalization tag of its own, so we didn't use its answer. Please try again." };
    }
    const used = new Set<number>();
    let unknown = false;
    // Models sometimes add spaces: "[[ T1 ]]" still counts.
    const restored = rewritten.replace(/\[\[\s*T(\d{1,3})\s*\]\]/g, (_m, n: string) => {
      const i = Number(n) - 1;
      if (i < 0 || i >= tags.length) {
        unknown = true;
        return "";
      }
      used.add(i);
      return tags[i];
    });
    if (unknown) {
      return { ok: false as const, error: "The AI added a personalization tag of its own, so we didn't use its answer. Please try again." };
    }
    if (used.size !== tags.length) {
      return { ok: false as const, error: "The AI dropped a personalization tag, so we didn't use its answer. Please try again." };
    }
    return { ok: true as const, text: restored };
  }

  return { text, restore };
}

/** Removes any merge tags from AI text (used where the AI may not add any). */
export function removeMergeTags(value: string): string {
  return value.replace(MERGE_TAG, " ").replace(/\{\{|\}\}/g, " ");
}

// ── Links ───────────────────────────────────────────────────────────────────

/** Every href="…" address in some HTML (decoded, trimmed). */
export function findLinks(html: string): string[] {
  const links: string[] = [];
  for (const m of html.matchAll(/\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi)) {
    links.push(normalizeLink(m[1] ?? m[2] ?? m[3] ?? ""));
  }
  return links;
}

const normalizeLink = (href: string) => decodeEntities(href).trim().replace(/\s+/g, "");

/** True when every link in `rewritten` was already in `original` (the AI can't invent links). */
export function linksAreUnchanged(original: string, rewritten: string): boolean {
  const allowed = new Set(findLinks(original));
  return findLinks(rewritten).every((href) => allowed.has(href));
}
