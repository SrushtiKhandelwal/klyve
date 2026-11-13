import "server-only";
import { Liquid, type Template } from "liquidjs";
import { BUILTIN_FIELDS, readAttributes, type AttributeValue } from "@/lib/contacts/common";
import type { Block, EmailDocument } from "@/lib/templates/document";

// Fills merge tags ({{ contact.FIRSTNAME }}, {{ unsubscribe_url }}, …) with
// one contact's details. Merge tags use Liquid, the same syntax Brevo uses.
//
// SAFETY RULES
//  1. Contact values are DATA, never template code. A template is parsed
//     once and rendered with the values, so a contact named
//     "{{ contact.EMAIL }}" or "<script>" just shows up as that text.
//  2. In HTML, every value is HTML-escaped on output ("outputEscape"). The
//     `raw` filter, which would switch that off, is disabled there.
//  3. Nothing can be read from disk: {% include %}, {% render %} and
//     {% layout %} are removed and the engine only knows an empty in-memory
//     file list.
//  4. Limits on template size, render time and memory, so a broken or
//     hostile template can't hang a campaign.
//  5. Unknown variables render as "" (a contact without a city just gets
//     nothing); unknown filters are an error, so typos are caught early.
//
// PERFORMANCE: campaigns personalize thousands of times, so use
// `compileTemplate()` once and call `.render(data)` per contact.

// ── Engines ──────────────────────────────────────────────────────────────────

const LIMITS = {
  /** Total characters a template may have (a big email is ~200k). */
  parseLimit: 2_000_000,
  /** Milliseconds one render may take. A normal email takes well under 5. */
  renderLimit: 2_000,
  /** Rough cap on memory used by filters and loops in one render. */
  memoryLimit: 50_000_000,
};

/** Tags that would load other templates (from disk). Not allowed in emails. */
const FILE_TAGS = ["include", "render", "layout", "block"];

/**
 * Links whose address comes from contact data, e.g. href="{{ contact.WEBSITE }}",
 * get this filter from render.ts: anything that isn't a web/mail/phone
 * link (such as "javascript:…") becomes "#".
 */
function safeUrl(value: unknown): string {
  const v = String(value ?? "").trim();
  return /^(https?:\/\/|mailto:|tel:)/i.test(v) ? v : "#";
}

function makeEngine(escapeHtml: boolean): Liquid {
  const engine = new Liquid({
    outputEscape: escapeHtml ? "escape" : undefined,
    strictFilters: true,
    strictVariables: false,
    // Only the data's own fields are visible, never things like
    // contact.constructor from JavaScript's object prototype.
    ownPropertyOnly: true,
    // An empty in-memory file list: nothing on disk can ever be read.
    templates: {},
    relativeReference: false,
    dynamicPartials: false,
    // Dates (e.g. {{ "now" | date: "%Y" }}) in UTC, the same on every server.
    timezoneOffset: 0,
    ...LIMITS,
  });
  for (const tag of FILE_TAGS) delete engine.tags[tag];
  // Re-registering `raw` WITHOUT liquidjs's "raw" flag means the value is
  // still escaped afterwards. In the text engine nothing is escaped anyway.
  if (escapeHtml) engine.registerFilter("raw", (v: unknown) => v);
  engine.registerFilter("safe_url", safeUrl);
  return engine;
}

export type Personalizer = {
  /** For HTML: every output value is HTML-escaped. */
  html: Liquid;
  /** For the subject line and plain text: values are output as they are. */
  text: Liquid;
};

/** Creates the two configured Liquid engines. Reuse them; they hold no per-contact state. */
export function createPersonalizer(): Personalizer {
  return { html: makeEngine(true), text: makeEngine(false) };
}

let shared: Personalizer | null = null;
function engines(): Personalizer {
  shared ??= createPersonalizer();
  return shared;
}

// ── Merge data ───────────────────────────────────────────────────────────────

/**
 * What a template can use: {{ contact.X }}, {{ unsubscribe_url }},
 * {{ view_in_browser_url }}, {{ current_year }}, {{ workspace.name }}.
 */
export type MergeData = {
  contact: Record<string, AttributeValue>;
  unsubscribe_url: string;
  /** Link to this email on the web (/v/<token>). Empty in previews/tests. */
  view_in_browser_url: string;
  /** Link to this person's preference centre (/p/<token>). Empty in previews/tests. */
  preferences_url: string;
  current_year: number;
  workspace: { name: string };
};

export type MergeContact = {
  email: string;
  firstName: string | null;
  lastName: string | null;
  /** The contact's `attributes` JSON column. */
  attributes: unknown;
};

export type MergeExtras = {
  unsubscribeUrl?: string;
  viewInBrowserUrl?: string;
  preferencesUrl?: string;
  workspaceName?: string;
  /** For tests; defaults to now. */
  now?: Date;
};

const ATTRIBUTE_KEY = /^[A-Z][A-Z0-9_]{0,39}$/;

/**
 * The values for one contact: contact.EMAIL, contact.FIRSTNAME,
 * contact.LASTNAME and every custom field (contact.CITY, …).
 */
export function buildMergeData(contact: MergeContact, extras: MergeExtras = {}): MergeData {
  const fields: Record<string, AttributeValue> = {};
  for (const [key, value] of Object.entries(readAttributes(contact.attributes))) {
    // Only proper field keys and simple values; anything odd is ignored.
    const simple = value === null || ["string", "number", "boolean"].includes(typeof value);
    if (ATTRIBUTE_KEY.test(key) && simple) fields[key] = value;
  }
  // Built-in fields always win over a custom value with the same key.
  const builtin: Record<(typeof BUILTIN_FIELDS)[number]["key"], string | null> = {
    EMAIL: contact.email,
    FIRSTNAME: contact.firstName,
    LASTNAME: contact.lastName,
  };
  return {
    contact: { ...fields, ...builtin },
    unsubscribe_url: extras.unsubscribeUrl ?? "",
    view_in_browser_url: extras.viewInBrowserUrl ?? "",
    preferences_url: extras.preferencesUrl ?? "",
    current_year: (extras.now ?? new Date()).getUTCFullYear(),
    workspace: { name: extras.workspaceName ?? "" },
  };
}

// ── Errors ───────────────────────────────────────────────────────────────────

/** A merge tag problem, with a message that can be shown to the user as is. */
export class TemplateError extends Error {
  constructor(
    message: string,
    /** Which part had the problem. */
    readonly part: "html" | "text" | "subject",
  ) {
    super(message);
    this.name = "TemplateError";
  }
}

const PART_LABELS = { html: "the email", text: "the plain-text version", subject: "the subject line" } as const;

/** Turns a liquidjs error into a sentence a beginner can act on. */
function friendlyMessage(err: unknown, where: string): string {
  const raw = err instanceof Error ? err.message : String(err);
  const message = raw.replace(/,\s*line:\d+,\s*col:\d+\s*$/, "");
  const token = (err as { token?: { getText?: () => string } }).token;
  let snippet = token?.getText?.() ?? "";
  if (snippet.length > 60) snippet = snippet.slice(0, 57) + "…";
  const at = snippet ? `: ${snippet}` : "";

  let m: RegExpExecArray | null;
  if (/not closed/.test(message)) {
    return `A merge tag in ${where} isn't closed${at}. Every "{{" needs a "}}" and every "{%" a "%}".`;
  }
  if ((m = /undefined filter:\s*(\S+)/.exec(message))) {
    return `"${m[1]}" isn't a filter we know (in ${where}${at}).`;
  }
  if ((m = /tag "?([^"\s]+)"? not found/.exec(message))) {
    return FILE_TAGS.includes(m[1])
      ? `{% ${m[1]} %} can't be used in emails (in ${where}).`
      : `"{% ${m[1]} %}" isn't a tag we know (in ${where}).`;
  }
  if (/limit exceeded/.test(message)) {
    return `${where[0].toUpperCase()}${where.slice(1)} is too big or too slow to personalize. Simplify its loops.`;
  }
  if (/not closed|unexpected|expected|invalid|illegal/i.test(message)) {
    return `A merge tag in ${where} has a mistake${at} (${message}).`;
  }
  return `There's a problem with a merge tag in ${where}${at} (${message}).`;
}

// ── Compiling and rendering ──────────────────────────────────────────────────

/**
 * In our stored HTML, merge tags are HTML-escaped like all other text (see
 * render.ts), e.g. {{ contact.FIRSTNAME | default: &quot;there&quot; }}.
 * Liquid needs the real characters, so inside {{ }} and {% %} ONLY, we turn
 * the basic entities back. Non-breaking spaces (editors insert them) become
 * normal spaces there too. Text outside the tags is never touched.
 */
export function decodeTagEntities(html: string): string {
  return html.replace(/\{\{[\s\S]*?\}\}|\{%[\s\S]*?%\}/g, (tag) =>
    tag
      .replace(/&(quot|#34|#x22|apos|#39|#x27|lt|#60|gt|#62|nbsp|#160);/gi, (_m, name: string) => {
        switch (name.toLowerCase()) {
          case "quot": case "#34": case "#x22": return '"';
          case "apos": case "#39": case "#x27": return "'";
          case "lt": case "#60": return "<";
          case "gt": case "#62": return ">";
          default: return " ";
        }
      })
      // &amp; last, so "&amp;quot;" becomes "&quot;" and not a quote.
      .replace(/&amp;/gi, "&")
      .replace(/ /g, " "),
  );
}

export type EmailParts = { html: string; text: string; subject: string };

export type CompiledTemplate = {
  /** Fills in one contact's values. Fast: no parsing happens here. */
  render(data: MergeData): EmailParts;
};

/**
 * Liquid reads "Hi {{ contact.CITY <b>…</b> {{ current_year }}" as ONE tag
 * running up to the next "}}", which gives a confusing error. So first we
 * look for a "{{" (or "{%") that starts again before it was closed, and
 * point at it ourselves.
 */
function checkTagsClosed(source: string): void {
  const m = /\{\{(?:(?!\}\})[\s\S])*?\{\{|\{%(?:(?!%\})[\s\S])*?\{%/.exec(source);
  if (!m) return;
  // Show the start of the broken tag, without any HTML around it.
  const snippet = m[0].slice(0, -2).split("<")[0].replace(/\s+/g, " ").trim().slice(0, 40);
  throw Object.assign(new Error("tag not closed"), { token: { getText: () => snippet } });
}

/** Parses with our extra "unclosed tag" check first. */
function parseSource(engine: Liquid, source: string): Template[] {
  checkTagsClosed(source);
  return engine.parse(source);
}

function parse(engine: Liquid, source: string, part: TemplateError["part"]): Template[] {
  try {
    return parseSource(engine, source);
  } catch (err) {
    throw new TemplateError(friendlyMessage(err, PART_LABELS[part]), part);
  }
}

/**
 * Parses a template ONCE. Throws TemplateError (friendly message) if a merge
 * tag is broken. Then call `.render(data)` for every contact.
 */
export function compileTemplate(template: EmailParts): CompiledTemplate {
  const { html: htmlEngine, text: textEngine } = engines();
  // Subject first: it is also copied into the HTML <title>, and its error
  // message is much clearer than the one the HTML would give.
  const subject = parse(textEngine, template.subject, "subject");
  const text = parse(textEngine, template.text, "text");
  const compiled = { html: parse(htmlEngine, decodeTagEntities(template.html), "html"), text, subject };

  const run = (engine: Liquid, tpl: Template[], data: MergeData, part: TemplateError["part"]): string => {
    try {
      return String(engine.renderSync(tpl, data));
    } catch (err) {
      throw new TemplateError(friendlyMessage(err, PART_LABELS[part]), part);
    }
  };

  return {
    render(data) {
      return {
        html: run(htmlEngine, compiled.html, data, "html"),
        text: run(textEngine, compiled.text, data, "text"),
        // A subject is one line: a value with line breaks must not add
        // email headers, so line breaks become spaces.
        subject: run(textEngine, compiled.subject, data, "subject").replace(/[\r\n]+/g, " ").trim(),
      };
    },
  };
}

/** One-off personalization (parses every time; use compileTemplate for many contacts). */
export function personalize(template: EmailParts, data: MergeData): EmailParts {
  return compileTemplate(template).render(data);
}

// ── Checking merge tags before saving ────────────────────────────────────────

// "tracking" is filled by the sender (open pixel / click links), never typed by users.
const KNOWN_ROOTS = new Set([
  "contact",
  "unsubscribe_url",
  "view_in_browser_url",
  "preferences_url",
  "current_year",
  "workspace",
  "tracking",
]);
const BUILTIN_KEYS = new Set<string>(BUILTIN_FIELDS.map((f) => f.key));

/**
 * Lists problems with the merge tags in a piece of template text (HTML,
 * plain text or a subject), so the editor can warn before saving.
 * An empty array means everything looks fine.
 *
 * Pass `contactKeys` (the workspace's custom field keys) to also catch
 * typos like {{ contact.CITTY }}.
 */
export function validateMergeTags(source: string, opts: { contactKeys?: string[] } = {}): string[] {
  const engine = engines().html;
  let tpl: Template[];
  try {
    tpl = parseSource(engine, decodeTagEntities(String(source ?? "")));
  } catch (err) {
    return [friendlyMessage(err, "this text")];
  }

  const problems: string[] = [];
  let variables: (string | number)[][] = [];
  try {
    variables = engine.globalVariableSegmentsSync(tpl) as (string | number)[][];
  } catch {
    return problems; // the analysis is a bonus; parsing already succeeded
  }
  const known = opts.contactKeys ? new Set([...BUILTIN_KEYS, ...opts.contactKeys]) : null;
  for (const segments of variables) {
    const [root, key] = segments.map(String);
    if (!KNOWN_ROOTS.has(root)) {
      problems.push(`"${root}" isn't a merge tag we know, so it will be empty. Did you mean contact.${root.toUpperCase()}?`);
    } else if (root === "contact" && key && known && !known.has(key)) {
      problems.push(`"contact.${key}" isn't one of your contact fields, so it will be empty.`);
    }
  }
  return [...new Set(problems)];
}

const BLOCK_LABELS: Record<Block["type"], string> = {
  heading: "a heading", text: "a text block", image: "an image", button: "a button", divider: "a divider",
  spacer: "a spacer", social: "the social links", video: "a video", html: "an HTML block", footer: "the footer",
};

/** The texts in a block that may contain merge tags. */
function blockTexts(block: Block): string[] {
  switch (block.type) {
    case "heading": case "text": case "footer": case "html": return [block.html];
    case "image": return [block.alt, block.href];
    case "button": return [block.label, block.href];
    case "video": return [block.alt, block.href];
    case "social": return block.links.map((l) => l.url);
    default: return [];
  }
}

/**
 * Merge tag SYNTAX errors in a design, block by block, e.g.
 * 'A merge tag in a text block isn't closed: {{ contact.CITY'.
 * Much clearer than an error for the whole rendered HTML, so run it before
 * rendering/saving. An empty array means the merge tags can all be read.
 */
export function documentMergeTagErrors(doc: EmailDocument, extra: { subject?: string; preheader?: string } = {}): string[] {
  const engine = engines().html;
  const problems: string[] = [];
  const check = (source: string, where: string) => {
    if (!source.includes("{")) return; // fast path: no tags at all
    try {
      parseSource(engine, decodeTagEntities(source));
    } catch (err) {
      problems.push(friendlyMessage(err, where));
    }
  };
  if (extra.subject) check(extra.subject, PART_LABELS.subject);
  if (extra.preheader) check(extra.preheader, "the preview text");
  for (const section of doc.sections) {
    for (const column of section.columns) {
      for (const block of column.blocks) {
        for (const text of blockTexts(block)) check(text, BLOCK_LABELS[block.type]);
      }
    }
  }
  return [...new Set(problems)];
}
