import "server-only";
import { absoluteUrl } from "@/lib/app-url";
import { createRecipientToken } from "@/lib/campaigns/tokens";
import { decodeTagEntities, personalize, type MergeData } from "@/lib/templates/personalize";
import { decodeEntities, escapeAttribute, mapAnchorTags, parseAttributes } from "@/lib/tracking/html-scan";

// Click and open tracking, prepared ONCE when a campaign launches.
//
//   <a href="https://shop.example/?a=1&amp;b=2">  becomes
//   <a href="{{ tracking.click_base }}/0">
//
// and the original address goes into a CampaignLink row (position 0). When
// the email is sent, every recipient gets their own click_base
// (https://app/t/c/<their token>), so a click on /t/c/<token>/0 tells us who
// clicked which link; then we redirect them to the original address.
//
// The open "pixel" is a 1×1 invisible image at {{ tracking.open_url }}.
//
// Only the HTML part is changed. The plain-text part keeps the real links:
// people read and copy those, and long tracking URLs would look suspicious.

/** The merge tags the rewritten email uses (filled per recipient by send-one.ts). */
export const CLICK_BASE_TAG = "{{ tracking.click_base }}";
export const OPEN_URL_TAG = "{{ tracking.open_url }}";

/** The open pixel. display:block avoids a stray gap in some email apps. */
export const OPEN_PIXEL_HTML = `<img src="${OPEN_URL_TAG}" width="1" height="1" alt="" style="display:block;width:1px;height:1px;border:0;" />`;

/** The classic 43-byte transparent 1×1 GIF, as base64. */
export const TRANSPARENT_GIF_BASE64 = "R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==";
/** The same image inline, for places where loading it must NOT count as an open. */
export const TRANSPARENT_GIF_DATA_URI = `data:image/gif;base64,${TRANSPARENT_GIF_BASE64}`;

/** Add this attribute to an <a> to leave it untracked: <a href="…" data-klyve-notrack>. */
export const NO_TRACK_ATTRIBUTE = "data-klyve-notrack";

/** Safety limits: a normal email has 5–30 links. */
const MAX_TRACKED_LINKS = 1_000;
const MAX_URL_LENGTH = 4_000;

export type TrackedLink = { position: number; url: string };

/** The `tracking` merge data for one recipient. */
export type TrackingMergeData = { click_base: string; open_url: string };

/**
 * One recipient's tracking addresses. The "track" token is signed, so nobody
 * can guess another person's or change it into theirs: opens and clicks
 * can't be faked for someone else.
 */
export function trackingUrls(recipientId: string): TrackingMergeData {
  const token = createRecipientToken(recipientId, "track");
  return { click_base: absoluteUrl(`/t/c/${token}`), open_url: absoluteUrl(`/t/o/${token}.gif`) };
}

// ── Which links are tracked ──────────────────────────────────────────────────

/** Links to these must keep working exactly as they are (and aren't "clicks"). */
const SPECIAL_TAG = /\{\{-?\s*(unsubscribe_url|view_in_browser_url|tracking\.)/;
/** The whole address is one merge tag, e.g. {{ contact.WEBSITE | safe_url }}. */
const WHOLE_MERGE_TAG = /^\{\{[^{}]*\}\}$/;

/**
 * Should a link (its decoded href) be tracked? Web links and whole-merge-tag
 * links, yes. Never: unsubscribe and view-in-browser links, mailto:/tel:,
 * "#anchors", or anything else that isn't a web address.
 */
export function isTrackableHref(href: string): boolean {
  const v = href.trim();
  if (!v || v.length > MAX_URL_LENGTH || SPECIAL_TAG.test(v)) return false;
  return /^https?:\/\//i.test(v) || WHOLE_MERGE_TAG.test(v);
}

// ── Rewriting the email at launch ────────────────────────────────────────────

/**
 * Prepares a campaign's rendered HTML for tracking. Returns the new HTML and
 * the links to store as CampaignLink rows (empty when clicks aren't tracked).
 */
export function prepareTrackedHtml(html: string, options: { trackOpens: boolean; trackClicks: boolean }): { html: string; links: TrackedLink[] } {
  let out = html;
  let links: TrackedLink[] = [];
  if (options.trackClicks) ({ html: out, links } = rewriteLinks(out));
  if (options.trackOpens) out = addOpenPixel(out);
  return { html: out, links };
}

/** Replaces each trackable <a href> with {{ tracking.click_base }}/<position>. */
export function rewriteLinks(html: string): { html: string; links: TrackedLink[] } {
  const links: TrackedLink[] = [];
  const out = mapAnchorTags(html, (tag) => {
    if (links.length >= MAX_TRACKED_LINKS) return null;
    const attrs = parseAttributes(tag);
    if (attrs.some((a) => a.name === NO_TRACK_ATTRIBUTE)) return null;
    // Browsers use the FIRST href if there are several.
    const href = attrs.find((a) => a.name === "href");
    if (!href || href.value === null) return null;
    const url = decodeAttribute(href.value).trim();
    if (!isTrackableHref(url)) return null;

    const position = links.length;
    links.push({ position, url });
    return tag.slice(0, href.start) + `href="${CLICK_BASE_TAG}/${position}"` + tag.slice(href.end);
  });
  return { html: out, links };
}

/** Puts the open pixel just before </body> (or at the very end if there's none). */
export function addOpenPixel(html: string): string {
  let at = -1;
  for (const m of html.matchAll(/<\/body\s*>/gi)) at = m.index; // the LAST one
  return at === -1 ? html + OPEN_PIXEL_HTML : html.slice(0, at) + OPEN_PIXEL_HTML + html.slice(at);
}

/**
 * The reverse, for TEST emails of an already-launched campaign (there's no
 * real recipient to track): puts the original links back and drops the pixel.
 */
export function untrackHtml(html: string, links: TrackedLink[]): string {
  const byPosition = new Map(links.map((l) => [l.position, l.url]));
  const clickRe = new RegExp(`href="${escapeRegExp(CLICK_BASE_TAG)}/(\\d+)"`, "g");
  return html
    .replace(clickRe, (whole, n: string) => {
      const url = byPosition.get(Number(n));
      return url === undefined ? 'href="#"' : `href="${escapeAttribute(url)}"`;
    })
    .split(OPEN_PIXEL_HTML)
    .join("");
}

// ── Click time ───────────────────────────────────────────────────────────────

/**
 * The real address for one recipient: fills any merge tags in the stored
 * link with their details, then checks it is a plain web address.
 * Returns null when it isn't (e.g. a contact's "website" is "javascript:…"),
 * so we NEVER redirect anywhere but http(s).
 */
export function personalizeLink(storedUrl: string, data: MergeData): string | null {
  let url = storedUrl;
  if (url.includes("{")) {
    try {
      // The plain-text engine: a URL isn't HTML, so values mustn't be HTML-escaped.
      url = personalize({ html: "", text: url, subject: "" }, data).text;
    } catch {
      return null; // a broken merge tag (can't normally get past the pre-send checks)
    }
  }
  return safeHttpUrl(url);
}

/** A normalized http(s) URL, or null. */
export function safeHttpUrl(value: string): string | null {
  const v = value.trim();
  if (!/^https?:\/\//i.test(v) || v.length > MAX_URL_LENGTH * 2) return null;
  try {
    const u = new URL(v);
    if ((u.protocol !== "http:" && u.protocol !== "https:") || !u.hostname) return null;
    return u.href; // re-serialized: spaces, line breaks etc. are encoded
  } catch {
    return null;
  }
}

// ── Entities ─────────────────────────────────────────────────────────────────
// (The HTML scanner itself lives in html-scan.ts, shared with utm.ts.)

/**
 * An attribute value as the browser would read it. Merge tags inside it are
 * decoded the way personalize() decodes them (decodeTagEntities), so the
 * stored link renders exactly like the original href would have.
 */
function decodeAttribute(raw: string): string {
  let out = "";
  let last = 0;
  for (const m of raw.matchAll(/\{\{[\s\S]*?\}\}|\{%[\s\S]*?%\}/g)) {
    out += decodeEntities(raw.slice(last, m.index)) + decodeTagEntities(m[0]);
    last = m.index + m[0].length;
  }
  return out + decodeEntities(raw.slice(last));
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
