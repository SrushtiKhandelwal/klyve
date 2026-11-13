import { decodeEntities, mapAnchorTags, parseAttributes } from "@/lib/tracking/html-scan";

// UTM tags (Settings → Link tracking), like Brevo's "UTM parameters".
//
// When a campaign launches (or an automation email is prepared), every web
// link in the email gets three extra bits at the end, for example:
//
//   https://shop.example/sale
//   → https://shop.example/sale?utm_source=klyve&utm_medium=email&utm_campaign=diwali-offer-2026
//
// The customer's own website analytics (Google Analytics, Plausible…) then
// show "this visitor came from the Diwali Offer email".
//
// RULES
//  - Only http(s) links. Never mailto:/tel:, "#anchors", links that are only a
//    merge tag ({{ contact.WEBSITE }}), unsubscribe / view-online links, any
//    link to this app itself, or links marked data-klyve-notrack.
//  - A utm_* value already in the link is never replaced (the person who
//    wrote the link chose it on purpose). Only the missing ones are added.
//  - Merge tags in the link ({{ contact.ID }}) are kept exactly as written,
//    and a #fragment stays at the very end, where it belongs.
//  - Runs BEFORE click tracking, so the stored link (CampaignLink.url) already
//    carries the tags and the click redirect passes them on. With click
//    tracking off, the tags are simply in the email's links.
//
// Pure functions, no database: safe in the browser too (the settings page
// uses them for its live example), and easy to test.

/** The workspace's UTM settings (Workspace.utmEnabled / utmSource / utmMedium). */
export type UtmSettings = { enabled: boolean; source: string; medium: string };

/** The three values added to each link. */
export type UtmTags = { source: string; medium: string; campaign: string };

export const UTM_DEFAULTS: UtmSettings = { enabled: false, source: "klyve", medium: "email" };

/** utm_source / utm_medium: 1–50 letters, digits, "-", "_" or ".". */
export const UTM_VALUE_MAX = 50;
export const UTM_VALUE_RE = /^[A-Za-z0-9._-]{1,50}$/;

/** A plain-English problem with a utm_source / utm_medium value, or null if it's fine. */
export function utmValueProblem(label: string, value: string): string | null {
  if (!value) return `Enter a ${label}.`;
  if (value.length > UTM_VALUE_MAX) return `Keep the ${label} under ${UTM_VALUE_MAX + 1} characters.`;
  if (!UTM_VALUE_RE.test(value)) return `The ${label} can only use letters, numbers, dashes (-), underscores (_) and dots (.).`;
  return null;
}

/**
 * The campaign name made URL-friendly, for utm_campaign:
 * "Diwali Offer 2026" → "diwali-offer-2026", "Café Ünïcode!" → "cafe-unicode".
 * A name with no usable letters (e.g. only emoji) becomes "email".
 */
export function utmCampaignSlug(name: string): string {
  const slug = name
    .normalize("NFKD") // "é" → "e" + accent
    .replace(/[̀-ͯ]/g, "") // drop the accents
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-") // everything else becomes one dash
    .replace(/^-+|-+$/g, "")
    .slice(0, 100)
    .replace(/-+$/g, "");
  return slug || "email";
}

/** Links to these must stay exactly as they are (same list as click tracking). */
const SPECIAL_TAG = /\{\{-?\s*(unsubscribe_url|view_in_browser_url|tracking\.)/;
const NO_UTM_ATTRIBUTE = "data-klyve-notrack";
const MAX_URL_LENGTH = 4_000;

type Options = {
  /** The app's own address (getAppUrl()). Links to it are left alone. */
  appUrl?: string;
};

/**
 * Adds the UTM tags to every eligible <a href> in an email's HTML.
 * Everything else in the HTML is copied unchanged.
 */
export function addUtmParams(html: string, tags: UtmTags, options: Options = {}): string {
  const params = tagParams(tags);
  if (params.length === 0) return html;
  const appHost = hostOf(options.appUrl ?? "");

  return mapAnchorTags(html, (tag) => {
    const attrs = parseAttributes(tag);
    if (attrs.some((a) => a.name === NO_UTM_ATTRIBUTE)) return null;
    // Browsers use the FIRST href if there are several.
    const href = attrs.find((a) => a.name === "href");
    if (!href || href.value === null) return null;
    const updated = addToUrl(href.value, params, { encoded: true, appHost });
    if (updated === null) return null;
    const quote = href.quote || '"';
    const value = quote === '"' ? updated.replace(/"/g, "&quot;") : updated.replace(/'/g, "&#39;");
    return tag.slice(0, href.start) + `href=${quote}${value}${quote}` + tag.slice(href.end);
  });
}

/**
 * The same for ONE plain URL (not HTML-encoded): used for the live example on
 * the settings page. Returns the URL unchanged when it isn't eligible.
 */
export function addUtmToUrl(url: string, tags: UtmTags, options: Options = {}): string {
  return addToUrl(url, tagParams(tags), { encoded: false, appHost: hostOf(options.appUrl ?? "") }) ?? url;
}

// ── How it works ─────────────────────────────────────────────────────────────

function tagParams(tags: UtmTags): [string, string][] {
  const list: [string, string][] = [
    ["utm_source", tags.source.trim()],
    ["utm_medium", tags.medium.trim()],
    ["utm_campaign", tags.campaign.trim()],
  ];
  return list.filter(([, v]) => v.length > 0);
}

/** "https://App.example:3000/x" → "app.example:3000" ("" when it isn't a URL). */
function hostOf(url: string): string {
  const m = /^https?:\/\/([^/?#\s]*)/i.exec(url.trim());
  return m ? m[1].toLowerCase() : "";
}

/**
 * Where the query ("?") and the fragment ("#") start in a link, ignoring
 * merge tags ({{ … }} / {% … %}) and, in HTML, entities like "&#39;".
 * -1 = there is none.
 */
function findParts(value: string, encoded: boolean): { query: number; fragment: number } {
  let query = -1;
  let i = 0;
  while (i < value.length) {
    if (value.startsWith("{{", i) || value.startsWith("{%", i)) {
      const close = value.indexOf(value[i + 1] === "{" ? "}}" : "%}", i + 2);
      i = close === -1 ? value.length : close + 2;
      continue;
    }
    if (encoded && value[i] === "&") {
      const entity = /^&(#\d{1,7}|#x[0-9a-f]{1,6}|[a-z]{2,8});/i.exec(value.slice(i, i + 12));
      if (entity) {
        i += entity[0].length;
        continue;
      }
    }
    if (value[i] === "#") return { query, fragment: i };
    if (value[i] === "?" && query === -1) query = i;
    i++;
  }
  return { query, fragment: -1 };
}

/**
 * Adds the missing utm_* params to one link. `encoded` = the value is an HTML
 * attribute (so "&" is written "&amp;"). Returns null when nothing changes.
 */
function addToUrl(value: string, params: [string, string][], opts: { encoded: boolean; appHost: string }): string | null {
  const raw = value.trim();
  const plain = opts.encoded ? decodeEntities(raw) : raw;
  if (!/^https?:\/\/[^\s]/i.test(plain) || plain.length > MAX_URL_LENGTH || SPECIAL_TAG.test(plain)) return null;

  // A link to this app (unsubscribe page, hosted form, view online…).
  const host = hostOf(plain);
  if (!host || (opts.appHost && host === opts.appHost)) return null;

  // Which utm_* are already there? Never overwrite those.
  const parts = findParts(plain, false);
  const queryText =
    parts.query === -1 ? "" : plain.slice(parts.query + 1, parts.fragment === -1 ? plain.length : parts.fragment);
  const existing = new Set(
    queryText
      .split("&")
      .map((pair) => safeDecode(pair.split("=")[0]).trim().toLowerCase())
      .filter(Boolean),
  );
  const missing = params.filter(([key]) => !existing.has(key));
  if (missing.length === 0) return null;

  // Insert at the end of the query, before any #fragment, in the original text.
  const at = findParts(raw, opts.encoded);
  const insertAt = at.fragment === -1 ? raw.length : at.fragment;
  const before = raw.slice(0, insertAt);
  const amp = opts.encoded ? "&amp;" : "&";
  let separator: string;
  if (at.query === -1 || at.query >= insertAt) separator = "?";
  else if (before.endsWith("?") || before.endsWith("&") || before.endsWith("&amp;")) separator = "";
  else separator = amp;

  const added = missing.map(([key, v]) => `${key}=${encodeURIComponent(v)}`).join(amp);
  const result = before + separator + added + raw.slice(insertAt);
  return result.length > MAX_URL_LENGTH ? null : result;
}

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s.replace(/\+/g, " "));
  } catch {
    return s;
  }
}
